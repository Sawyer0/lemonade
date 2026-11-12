// FinishGate unit tests (LM-19): fake challenger and judge models, real
// checklist. The golden case plants a wrong lead — "fuel pump failure" —
// against a ledger that holds fuel pressure and a weak spark: the gate
// must block it. The passing case is the coil lead on the same ledger.
import { describe, expect, it, vi } from 'vitest';
import type { GenerativeModel } from '@google-cloud/vertexai';
import type {
    AIAnalysis,
    DiagnosisClaim,
    FinalDiagnosis,
    FinishGateRunInput,
    ILogger,
    LedgerEntry,
    LoopDecision,
} from '@lemonade/core';
import { parseDtc, TestLibrary } from '@lemonade/core';
import { misfireDefinitions } from '../../../../../core/src/diagnosis/loop/__tests__/fixtures';
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
        { kind: 'dtc', id: 'dtc-p0300', text: 'DTC P0300 was read from the vehicle', code: 'P0300', citations: ['entry-dtc'] },
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
    return { kind: 'repair', hypothesisId: 'ignition-coil-failure', reason: 'Top cause cleared the commit threshold at 90%.' };
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
            fakeModel(judgeReply(false, ['hypothesis'], ['The fuel pressure reading contradicts a fuel pump failure.'])),
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

    it('abstains with a known/unknown handoff after the third failed attempt', async () => {
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
            fakeModel(judgeReply(false, ['hypothesis'], ['The fuel pressure reading contradicts a fuel pump failure.'])),
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
            verification: { isVerified: true, verifiedSource: 'http://example.com/tsb', searchQueryUsed: null, conflictingEvidence: null },
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
