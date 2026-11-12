// FinishGate unit tests (LM-19): fake challenger and judge models, real
// checklist. The golden case plants a wrong lead — "fuel pump failure" —
// against a ledger that holds fuel pressure and a weak spark: the gate
// must block it. The passing case is the coil lead on the same ledger.
import { describe, expect, it, vi } from 'vitest';
import type { GenerativeModel } from '@google-cloud/vertexai';
import type {
    AIAnalysis,
    CaseGoal,
    DiagnosisClaim,
    FinalDiagnosis,
    FinishGateRunInput,
    ILogger,
    LedgerEntry,
    LoopDecision,
} from '@lemonade/core';
import { buildGoal, parseDtc, TestLibrary } from '@lemonade/core';
import { misfireDefinitions } from '../../../../../core/src/diagnosis/loop/__tests__/fixtures';
import { buildGoldenCase, buildGoldenGoal, GOLDEN_GOAL_ID } from '../../../../../core/src/goal/__tests__/fixtures/goldenCase';
import { Challenger } from '../Challenger';
import { FinishGate } from '../FinishGate';

const CASE_ID = '11111111-1111-4111-8111-111111111111';

function baseEntry(id: string, source: LedgerEntry['source'] = 'tech'): Omit<LedgerEntry, 'type' | 'payload'> {
    return {
        id,
        caseId: CASE_ID,
        sequence: 1,
        actor: { kind: 'user', id: 'tech-1' },
        source,
        occurredAt: new Date('2026-11-11T10:00:00.000Z'),
        previousHash: '0'.repeat(64),
        entryHash: 'a'.repeat(64),
        createdAt: new Date('2026-11-11T10:00:00.000Z'),
    };
}

function dtcEntry(id: string, codes: string[]): LedgerEntry {
    return { ...baseEntry(id), type: 'dtc_read', payload: { codes } } as LedgerEntry;
}

function testResultEntry(id: string, testName: string, result: 'pass' | 'fail' | 'inconclusive'): LedgerEntry {
    return { ...baseEntry(id), type: 'test_result', payload: { testName, result } } as LedgerEntry;
}

/** Golden ledger: P0300 read, fuel pressure held, spark weak. */
function goldenLedger(): LedgerEntry[] {
    return [
        dtcEntry('entry-dtc', ['P0300']),
        testResultEntry('entry-fuel', 'measure-fuel-pressure', 'pass'),
        testResultEntry('entry-spark', 'measure-spark-strength', 'fail'),
    ];
}

function claimsFor(diagnosis: string, citations: string[]): DiagnosisClaim[] {
    return [
        { kind: 'hypothesis', id: 'hypothesis', text: diagnosis, citations },
        {
            kind: 'dtc',
            id: 'dtc-p0300',
            text: 'DTC P0300 was read from the vehicle',
            code: 'P0300',
            citations: ['entry-dtc'],
        },
        {
            kind: 'test',
            id: 'test-measure-spark-strength',
            text: 'Test Measure spark at the plug was run',
            testId: 'measure-spark-strength',
            citations: ['entry-spark'],
        },
    ];
}

function candidateFor(diagnosis: string): FinalDiagnosis {
    return {
        decision: 'PROCEED',
        reasoningTrace: 'synthesis',
        userOutput: diagnosis,
        requiredActions: ['Replace the ignition coil'],
        metaConfidence: 0.9,
    };
}

function repairDecision(): LoopDecision {
    return {
        kind: 'repair',
        hypothesisId: 'ignition-coil-failure',
        reason: 'Top cause cleared the commit threshold at 90%.',
    };
}

function fakeModel(text: string | null, error?: Error): GenerativeModel {
    const generateContent = vi.fn();
    if (error) {
        generateContent.mockRejectedValue(error);
    } else {
        generateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text }] } }] },
        });
    }
    return { generateContent } as unknown as GenerativeModel;
}

function challengerReply(objections: unknown[]): string {
    return JSON.stringify({ objections });
}

function judgeReply(passed: boolean, unmappedClaimIds: string[] = [], reasons: string[] = []): string {
    return JSON.stringify({ passed, unmappedClaimIds, stopRuleMet: true, reasons });
}

/** A fake model whose calls the test can count and inspect. */
function spyingModel(
    text: string | null,
    error?: Error,
): { model: GenerativeModel; generateContent: ReturnType<typeof vi.fn> } {
    const generateContent = vi.fn();
    if (error) {
        generateContent.mockRejectedValue(error);
    } else {
        generateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text }] } }] },
        });
    }
    return { model: { generateContent } as unknown as GenerativeModel, generateContent };
}

/** The judge prompt the fake judge model was called with. */
function judgePrompt(generateContent: ReturnType<typeof vi.fn>): string {
    const call = generateContent.mock.calls[0]?.[0] as
        | { contents: Array<{ parts: Array<{ text: string }> }> }
        | undefined;
    return call?.contents[0]?.parts[0]?.text ?? '';
}

const logger: ILogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const LIBRARY = TestLibrary.fromDefinitions(misfireDefinitions());

function gateWith(challengerModel: GenerativeModel, judgeModel: GenerativeModel): FinishGate {
    return new FinishGate({
        challenger: new Challenger(challengerModel, logger),
        gateModel: judgeModel,
        logger,
        testLibrary: LIBRARY,
    });
}

describe('FinishGate.evaluateCandidate', () => {
    it('passes a cited diagnosis when the challenger, checklist and judge agree', async () => {
        const gate = gateWith(fakeModel(challengerReply([])), fakeModel(judgeReply(true)));
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Ignition coil failure'),
            claims: claimsFor('Ignition coil failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(true);
        expect(verdict.outcome).toBe('pass');
        expect(verdict.reasons).toEqual([]);
    });

    it('blocks a planted wrong lead when the challenger decisively objects', async () => {
        const gate = gateWith(
            fakeModel(
                challengerReply([
                    {
                        text: 'Fuel pressure held at 55 psi, so a fuel pump failure does not explain the misfire',
                        ledgerEntryIds: ['entry-fuel'],
                        decisive: true,
                    },
                ]),
            ),
            fakeModel(
                judgeReply(false, ['hypothesis'], ['The fuel pressure reading contradicts a fuel pump failure.']),
            ),
        );
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Fuel pump failure'),
            claims: claimsFor('Fuel pump failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('retry');
        expect(verdict.reasons).toContain(
            'Challenger: Fuel pressure held at 55 psi, so a fuel pump failure does not explain the misfire',
        );
        expect(verdict.handoff).toBeUndefined();
    });

    it('blocks a diagnosis with no ledger citations even when the judge would pass', async () => {
        const gate = gateWith(fakeModel(challengerReply([])), fakeModel(judgeReply(true)));
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Ignition coil failure'),
            claims: claimsFor('Ignition coil failure', []),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('retry');
        expect(verdict.checklistFailures).toEqual(
            expect.arrayContaining([expect.objectContaining({ claimId: 'hypothesis', code: 'missing-citation' })]),
        );
    });

    it('abstains with a abstain handoff after the third failed attempt', async () => {
        const gate = gateWith(
            fakeModel(
                challengerReply([
                    {
                        text: 'Fuel pressure held at 55 psi, so a fuel pump failure does not explain the misfire',
                        ledgerEntryIds: ['entry-fuel'],
                        decisive: true,
                    },
                ]),
            ),
            fakeModel(
                judgeReply(false, ['hypothesis'], ['The fuel pressure reading contradicts a fuel pump failure.']),
            ),
        );
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Fuel pump failure'),
            claims: claimsFor('Fuel pump failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 3,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('abstain');
        expect(verdict.handoff).toBeDefined();
        // Confirmed lists only evidence facts that checked out, never the wrong lead itself.
        expect(verdict.handoff?.confirmed).toEqual([
            'DTC P0300 was read from the vehicle',
            'Test Measure spark at the plug was run',
        ]);
        expect(verdict.handoff?.confirmed).not.toContain('Fuel pump failure');
        expect(verdict.handoff?.ruledOut).toEqual([
            'Fuel pressure held at 55 psi, so a fuel pump failure does not explain the misfire',
        ]);
        expect(verdict.handoff?.nextTest).toBeNull();
        expect(verdict.handoff?.escalateWhen).toContain('Fuel pressure held at 55 psi');
        // The handoff carries the attempt's own failure reasons as its reason.
        expect(verdict.handoff?.reason).toContain('Fuel pressure held at 55 psi');
    });

    it('blocks when the workup stop rule was not met, even when the judge would pass', async () => {
        const gate = gateWith(fakeModel(challengerReply([])), fakeModel(judgeReply(true)));
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Ignition coil failure'),
            claims: claimsFor('Ignition coil failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: {
                kind: 'next-test',
                nextTest: {
                    testId: 'measure-spark-strength',
                    title: 'Measure spark at the plug',
                    costTier: 'measure',
                    cost: { laborUsd: 30, partsUsd: 0, downtimeUsd: 15, riskUsd: 25, totalUsd: 70 },
                    expectedValuePerDollar: 0.01,
                    discriminationProbability: 0.8,
                    steps: [],
                    spoken: [],
                    safetyBlockers: [],
                },
                challenger: null,
            },
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.reasons).toContain('Stop rule not met: the workup\'s next step is "Measure spark at the plug"');
    });

    it('fails safe when the challenger cannot run', async () => {
        const gate = gateWith(fakeModel(null, new Error('model unavailable')), fakeModel(judgeReply(true)));
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Ignition coil failure'),
            claims: claimsFor('Ignition coil failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.reasons).toContain('Challenger could not run: model unavailable');
    });

    it('fails safe when the independent gate cannot run', async () => {
        const gate = gateWith(fakeModel(challengerReply([])), fakeModel(null, new Error('model unavailable')));
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Ignition coil failure'),
            claims: claimsFor('Ignition coil failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.reasons).toContain('Independent gate could not run: model unavailable');
    });

    it('fails when the judge passes while leaving claims unmapped', async () => {
        const gate = gateWith(fakeModel(challengerReply([])), fakeModel(judgeReply(true, ['hypothesis'])));
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Ignition coil failure'),
            claims: claimsFor('Ignition coil failure', ['entry-dtc', 'entry-fuel', 'entry-spark']),
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.reasons).toContain('Independent gate passed while leaving claims unmapped: hypothesis');
    });
});

describe('FinishGate with a goal (LM-27)', () => {
    /** The golden goal plus one blocking `judge`-kind criterion. Same goal id as the golden ledger's goal_set entry. */
    function goalWithJudgeCriterion(): CaseGoal {
        return buildGoal({
            goalId: GOLDEN_GOAL_ID,
            caseId: CASE_ID,
            complaint: {
                text: 'Misfire on cylinder 1 at idle',
                symptoms: ['misfire at idle'],
                confirmedByTech: true,
            },
            outcome: 'Root cause of misfire confirmed and repair verified',
            constraints: [],
            criteria: [
                {
                    id: 'differentiate.top_hypothesis',
                    phase: 'differentiate',
                    description: 'One root-cause hypothesis leads the posterior by a clear margin',
                    check: { kind: 'posterior', minTop: 0.7, minMargin: 0.2 },
                },
                {
                    id: 'verify.retest',
                    phase: 'verify',
                    description: 'Pre-registered compression re-test passes after the repair',
                    check: {
                        kind: 'pre_registered_test_passed',
                        testName: 'compression-cylinder-1',
                        admissible: ['tech', 'sandbox'],
                    },
                },
                {
                    id: 'verify.symptom_absent',
                    phase: 'verify',
                    description: 'No misfire at idle after the repair',
                    check: {
                        kind: 'ledger_has',
                        entryKind: 'observation',
                        where: { text: 'No misfire at idle after repair' },
                        admissible: ['tech'],
                    },
                },
                {
                    id: 'commit.cause_named',
                    phase: 'commit',
                    description: 'The diagnosis names the single root cause the ledger supports',
                    check: {
                        kind: 'judge',
                        rubric:
                            'The spoken diagnosis names one root cause, and every part of that cause is supported by a cited ledger entry.',
                    },
                },
            ],
            budget: { maxTokens: 200000, maxWallMinutes: 60, maxTestCostMinutes: 30 },
        });
    }

    /** Claims over the golden ledger: the hypothesis cites every citable entry, the DTC cites its reading. */
    function goldenClaims(diagnosis: string, entries: LedgerEntry[]): DiagnosisClaim[] {
        const citableIds = entries
            .filter((entry) => ['vin_decoded', 'dtc_read', 'observation', 'test_result', 'outcome'].includes(entry.type))
            .map((entry) => entry.id);
        const dtcEntry = entries.find((entry) => entry.type === 'dtc_read');
        return [
            { kind: 'hypothesis', id: 'hypothesis', text: diagnosis, citations: citableIds },
            {
                kind: 'dtc',
                id: 'dtc-p0300',
                text: 'DTC P0300 was read from the vehicle',
                code: 'P0300',
                citations: dtcEntry ? [dtcEntry.id] : [],
            },
        ];
    }

    function judgeCriteriaReply(
        passed: boolean,
        scores: Array<{ criterionId: string; passed: boolean; reason: string }>,
        reasons: string[] = [],
    ): string {
        return JSON.stringify({ passed, stopRuleMet: true, reasons, judgeCriteria: scores });
    }

    it('blocks on an unmet deterministic goal criterion without calling the challenger or the judge', async () => {
        const { entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
        const challenger = spyingModel(challengerReply([]));
        const judge = spyingModel(judgeReply(true));
        const gate = gateWith(challenger.model, judge.model);
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Fuel pump failure'),
            claims: goldenClaims('Fuel pump failure', entries),
            ledger: entries,
            goal: buildGoldenGoal(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('retry');
        expect(verdict.reasons).toContain(
            'Goal criterion verify.retest unmet: no passing compression-cylinder-1 result after the goal was set',
        );
        expect(verdict.reasons).toContain(
            'Goal criterion verify.symptom_absent unmet: no observation entry from an admissible source matches',
        );
        expect(verdict.unmetCriteria.map((criterion) => criterion.criterionId)).toEqual([
            'verify.retest',
            'verify.symptom_absent',
        ]);
        expect(verdict.handoff).toBeUndefined();
        // The deterministic gate runs before the challenger and the judge:
        // no model is called while a deterministic criterion is unmet.
        expect(challenger.generateContent).not.toHaveBeenCalled();
        expect(judge.generateContent).not.toHaveBeenCalled();
    });

    it('abstains on the final attempt when the goal still blocks, with a criterion-level handoff reason', async () => {
        const { entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
        const challenger = spyingModel(challengerReply([]));
        const judge = spyingModel(judgeReply(true));
        const gate = gateWith(challenger.model, judge.model);
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Fuel pump failure'),
            claims: goldenClaims('Fuel pump failure', entries),
            ledger: entries,
            goal: buildGoldenGoal(),
            loopDecision: repairDecision(),
            attempt: 3,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('abstain');
        expect(verdict.handoff).toBeDefined();
        expect(verdict.handoff?.reason).toContain('verify.retest');
        expect(challenger.generateContent).not.toHaveBeenCalled();
        expect(judge.generateContent).not.toHaveBeenCalled();
    });

    it('runs the judge on the goal judge criteria once the deterministic criteria are met', async () => {
        const { entries } = buildGoldenCase();
        const challenger = spyingModel(challengerReply([]));
        const judge = spyingModel(
            judgeCriteriaReply(true, [
                {
                    criterionId: 'commit.cause_named',
                    passed: true,
                    reason: 'The diagnosis names the head gasket leak, supported by the compression re-test.',
                },
            ]),
        );
        const gate = gateWith(challenger.model, judge.model);
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Head gasket leak'),
            claims: goldenClaims('Head gasket leak', entries),
            ledger: entries,
            goal: goalWithJudgeCriterion(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(true);
        expect(verdict.outcome).toBe('pass');
        expect(verdict.reasons).toEqual([]);
        expect(verdict.unmetCriteria).toEqual([]);
        expect(challenger.generateContent).toHaveBeenCalledTimes(1);
        expect(judge.generateContent).toHaveBeenCalledTimes(1);
        // The judge scores only the judge criterion, against the ledger snapshot.
        const prompt = judgePrompt(judge.generateContent);
        expect(prompt).toContain('commit.cause_named');
        expect(prompt).toContain('Score ONLY the judge criteria');
        expect(prompt).toContain('Case ledger snapshot');
        expect(prompt).not.toContain('unmappedClaimIds');
    });

    it('blocks when the judge fails a judge criterion, and the failure becomes the retry prompt', async () => {
        const { entries } = buildGoldenCase();
        const challenger = spyingModel(challengerReply([]));
        const judge = spyingModel(
            judgeCriteriaReply(false, [
                {
                    criterionId: 'commit.cause_named',
                    passed: false,
                    reason: 'The diagnosis names a fuel pump failure the ledger does not support.',
                },
            ]),
        );
        const gate = gateWith(challenger.model, judge.model);
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Fuel pump failure'),
            claims: goldenClaims('Fuel pump failure', entries),
            ledger: entries,
            goal: goalWithJudgeCriterion(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('retry');
        expect(verdict.reasons).toContain(
            'Independent gate: judge criterion commit.cause_named failed: The diagnosis names a fuel pump failure the ledger does not support.',
        );
        expect(verdict.unmetCriteria).toEqual([
            {
                criterionId: 'commit.cause_named',
                phase: 'commit',
                verdict: 'unmet',
                blocking: true,
                evidence: [],
                reason: 'The diagnosis names a fuel pump failure the ledger does not support.',
            },
        ]);
    });

    it('fails closed when the judge never scores a judge criterion', async () => {
        const { entries } = buildGoldenCase();
        const gate = gateWith(
            fakeModel(challengerReply([])),
            fakeModel(judgeCriteriaReply(true, [])),
        );
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Head gasket leak'),
            claims: goldenClaims('Head gasket leak', entries),
            ledger: entries,
            goal: goalWithJudgeCriterion(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(false);
        expect(verdict.outcome).toBe('retry');
        expect(verdict.reasons).toContain('Independent gate did not score judge criterion commit.cause_named');
        expect(verdict.unmetCriteria.map((criterion) => criterion.criterionId)).toEqual(['commit.cause_named']);
    });

    it('falls back to the classic judge when the goal has no judge criteria', async () => {
        const { entries } = buildGoldenCase();
        const challenger = spyingModel(challengerReply([]));
        const judge = spyingModel(judgeReply(true));
        const gate = gateWith(challenger.model, judge.model);
        const verdict = await gate.evaluateCandidate({
            candidate: candidateFor('Head gasket leak'),
            claims: goldenClaims('Head gasket leak', entries),
            ledger: entries,
            goal: buildGoldenGoal(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(verdict.passed).toBe(true);
        expect(verdict.outcome).toBe('pass');
        expect(judge.generateContent).toHaveBeenCalledTimes(1);
        expect(judgePrompt(judge.generateContent)).toContain('Pass ONLY when every claim maps');
    });

    it('blocks a run through evaluateRun when the goal is unmet, without calling any model', async () => {
        const { entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
        const challenger = spyingModel(challengerReply([]));
        const judge = spyingModel(judgeReply(true));
        const gate = gateWith(challenger.model, judge.model);
        const parsed = parseDtc('P0300');
        if (!parsed.ok) throw new Error('P0300 must parse');
        const visual: AIAnalysis = {
            diagnosis: 'Fuel pump failure',
            confidence: 0.9,
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'medium',
            safety_alert: false,
            suggested_actions: ['Replace the fuel pump'],
            engineDescription: 'Stock',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'clean',
            reasoning: 'Misfire with fuel pressure',
            investigationPlan: [],
        };
        const result = await gate.evaluateRun({
            visual,
            recalls: [],
            similar: [],
            verification: {
                isVerified: true,
                verifiedSource: 'http://example.com/tsb',
                searchQueryUsed: null,
                conflictingEvidence: null,
            },
            dtcCodes: [parsed.parsed],
            ledger: entries,
            goal: buildGoldenGoal(),
            loopDecision: repairDecision(),
            attempt: 1,
        });
        expect(result.passed).toBe(false);
        expect(result.outcome).toBe('retry');
        expect(result.reasons).toContain(
            'Goal criterion verify.retest unmet: no passing compression-cylinder-1 result after the goal was set',
        );
        expect(result.unmetCriteria.map((criterion) => criterion.criterionId)).toEqual([
            'verify.retest',
            'verify.symptom_absent',
        ]);
        expect(result.candidate?.userOutput).toContain('Fuel pump failure');
        expect(challenger.generateContent).not.toHaveBeenCalled();
        expect(judge.generateContent).not.toHaveBeenCalled();
    });
});

describe('FinishGate.evaluateRun', () => {
    it('synthesizes the candidate from the run evidence and gates it', async () => {
        const gate = gateWith(fakeModel(challengerReply([])), fakeModel(judgeReply(true)));
        const parsed = parseDtc('P0300');
        if (!parsed.ok) throw new Error('P0300 must parse');
        const visual: AIAnalysis = {
            diagnosis: 'Ignition coil failure',
            confidence: 0.9,
            visual_evidence: [],
            acoustic_evidence: [],
            severity: 'medium',
            safety_alert: false,
            suggested_actions: ['Replace the ignition coil'],
            engineDescription: 'Stock',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'clean',
            reasoning: 'Misfire with weak spark',
            investigationPlan: [],
        };
        const input: FinishGateRunInput = {
            visual,
            recalls: [],
            similar: [],
            verification: {
                isVerified: true,
                verifiedSource: 'http://example.com/tsb',
                searchQueryUsed: null,
                conflictingEvidence: null,
            },
            dtcCodes: [parsed.parsed],
            ledger: goldenLedger(),
            loopDecision: repairDecision(),
            attempt: 1,
        };
        const result = await gate.evaluateRun(input);
        expect(result.passed).toBe(true);
        expect(result.outcome).toBe('pass');
        expect(result.candidate?.decision).toBe('PROCEED');
        expect(result.candidate?.userOutput).toContain('Ignition coil failure');
    });
});
