// Finish gate (LM-19): the independent check that runs before the talker
// may state a diagnosis.
//
// One attempt runs three stages in order: the challenger argues against
// the leading hypothesis from the ledger; the deterministic checklist
// validates every cited code, spec value and test name; an independent
// judge — a separate model call on the worker model, never the reasoner
// grading itself — checks each claim maps to a ledger entry and the stop
// rule was met. The attempt passes only when all three pass. A failed
// attempt is a retry while attempts remain, then an abstention with a
// abstain handoff. The checklist runs even when a model stage
// fails, so the retry always carries the fullest feedback.
import type { GenerationConfig, GenerativeModel } from '@google-cloud/vertexai';
import type {
    AbstainHandoff,
    ChallengerObjection,
    ChecklistFailure,
    DiagnosisClaim,
    FinalDiagnosis,
    FinishGateRunInput,
    FinishGateRunResult,
    FinishGateRunner,
    FinishGateVerdict,
    ILogger,
    LedgerEntry,
    LoopDecision,
    TestLibrary,
} from '@lemonade/core';
import {
    buildAbstainHandoff,
    checkDiagnosisClaims,
    citableLedgerSummaries,
    claimsForRun,
    SHARED_CONFIG,
} from '@lemonade/core';
import { synthesizeDiagnosis } from './DiagnosisSynthesizer';
import { Challenger } from './Challenger';
import { parseModelJson } from './modelJson';
import { defaultTestLibraryDir, loadTestLibraryFromDirectory } from './testLibraryLoader';

const MAX_ATTEMPTS = SHARED_CONFIG.FINISH_GATE.MAX_ATTEMPTS;

export interface EvaluateCandidateInput {
    candidate: FinalDiagnosis;
    claims: DiagnosisClaim[];
    ledger: LedgerEntry[];
    loopDecision?: LoopDecision | null;
    attempt: number;
    traceId?: string;
}

interface JudgeReply {
    passed: boolean;
    unmappedClaimIds: string[];
    stopRuleMet: boolean;
    reasons: string[];
}

/** A judge reply is only usable when every field has the shape the prompt asked for. */
function isUsableJudgeReply(parsed: unknown): parsed is JudgeReply {
    if (typeof parsed !== 'object' || parsed === null) return false;
    const reply = parsed as JudgeReply;
    return (
        typeof reply.passed === 'boolean' &&
        Array.isArray(reply.unmappedClaimIds) &&
        reply.unmappedClaimIds.every((id) => typeof id === 'string') &&
        typeof reply.stopRuleMet === 'boolean' &&
        Array.isArray(reply.reasons) &&
        reply.reasons.every((reason) => typeof reason === 'string')
    );
}

function buildJudgePrompt(
    candidate: FinalDiagnosis,
    claims: DiagnosisClaim[],
    objections: ChallengerObjection[],
    checklistFailures: ChecklistFailure[],
    stopRuleMet: boolean | null,
    ledgerLines: string[],
): string {
    const claimLines = claims.map(
        (claim) =>
            `- [${claim.id}] (${claim.kind}) "${claim.text}" — cites: ${claim.citations.length > 0 ? claim.citations.join(', ') : 'nothing'}`,
    );
    const objectionLines =
        objections.length > 0
            ? objections.map(
                  (o) =>
                      `- ${o.decisive ? '[decisive] ' : ''}${o.text} (entries: ${o.ledgerEntryIds.join(', ') || 'none'})`,
              )
            : ['No objections.'];
    const checklistLines =
        checklistFailures.length > 0
            ? checklistFailures.map((failure) => `- [${failure.claimId}] ${failure.code}: ${failure.reason}`)
            : [
                  'Checklist passed: every citation exists, is admissible, and every code, test and spec value validated.',
              ];
    const stopRuleLine =
        stopRuleMet === null
            ? 'No workup ran, so judge the stop rule from the evidence: was enough verified to commit, or is more testing needed?'
            : stopRuleMet
              ? 'The workup stop rule WAS met (the loop committed to a repair).'
              : 'The workup stop rule was NOT met: the diagnosis must not be spoken as final.';
    return [
        'You are the independent finish gate. You did not produce the diagnosis below, and you do not grade',
        'your own work: you check it against the case ledger and nothing else.',
        '',
        'Pass ONLY when every claim maps to at least one cited ledger entry that supports it AND the stop rule',
        'was met. A claim that cites entries that do not support it is unmapped. A claim that cites nothing is',
        'unmapped. If the stop rule was not met, fail even when the claims map.',
        '',
        'OUTPUT FORMAT: JSON ONLY',
        '{',
        '  "passed": false,',
        '  "unmappedClaimIds": ["<claim id with no supporting cited entry>"],',
        '  "stopRuleMet": true,',
        '  "reasons": ["one sentence per problem found"]',
        '}',
        '',
        `Candidate diagnosis to speak: "${candidate.userOutput}"`,
        '',
        'Claims:',
        ...claimLines,
        '',
        'Challenger objections:',
        ...objectionLines,
        '',
        'Deterministic checklist result:',
        ...checklistLines,
        '',
        `Stop rule: ${stopRuleLine}`,
        '',
        'Case ledger (citable entries only):',
        ...(ledgerLines.length > 0 ? ledgerLines : ['No citable ledger entries.']),
    ].join('\n');
}

export interface FinishGateDeps {
    challenger: Challenger;
    gateModel: GenerativeModel;
    logger: ILogger;
    /** Injected for tests so the loader never touches disk. */
    testLibrary?: TestLibrary;
    /** Injected for tests so the loader never touches disk. */
    testLibraryDir?: string;
}

export class FinishGate implements FinishGateRunner {
    private libraryCache: TestLibrary | null | undefined;

    constructor(private readonly deps: FinishGateDeps) {}

    /** The deterministic tables, loaded once. A missing library fails closed in the checklist. */
    private testLibrary(): TestLibrary | undefined {
        if (this.libraryCache !== undefined) {
            return this.libraryCache ?? undefined;
        }
        if (this.deps.testLibrary) {
            this.libraryCache = this.deps.testLibrary;
            return this.libraryCache;
        }
        try {
            this.libraryCache = loadTestLibraryFromDirectory(this.deps.testLibraryDir ?? defaultTestLibraryDir());
        } catch (error) {
            this.deps.logger.warn('[FinishGate] Test library could not be loaded; cited tests cannot validate', {
                error,
            });
            this.libraryCache = null;
        }
        return this.libraryCache ?? undefined;
    }

    /**
     * One attempt over an explicit candidate and claims. The caller owns
     * the attempt count: a failed attempt is a retry while attempts
     * remain, then an abstention with the handoff.
     */
    async evaluateCandidate(input: EvaluateCandidateInput): Promise<FinishGateVerdict> {
        const { candidate, claims, ledger, loopDecision, attempt } = input;
        const reasons: string[] = [];
        const hypothesis = claims.find((claim) => claim.kind === 'hypothesis')?.text ?? candidate.userOutput;

        const checklist = checkDiagnosisClaims(claims, ledger, this.testLibrary());
        for (const failure of checklist.failures) {
            reasons.push(`Checklist: ${failure.reason}`);
        }

        let objections: ChallengerObjection[] = [];
        let challengerRan = false;
        try {
            objections = await this.deps.challenger.challenge(hypothesis, ledger, input.traceId);
            challengerRan = true;
        } catch (error) {
            reasons.push(`Challenger could not run: ${error instanceof Error ? error.message : String(error)}`);
        }
        for (const objection of objections) {
            if (objection.decisive) {
                reasons.push(`Challenger: ${objection.text}`);
            }
        }

        // The stop rule is deterministic when a workup ran: only a commit
        // lets the diagnosis be spoken. Without a workup the judge decides.
        const stopRuleMet = loopDecision === undefined || loopDecision === null ? null : loopDecision.kind === 'repair';
        if (stopRuleMet === false && loopDecision) {
            if (loopDecision.kind === 'next-test') {
                reasons.push(`Stop rule not met: the workup's next step is "${loopDecision.nextTest.title}"`);
            } else if (loopDecision.kind === 'escalate') {
                reasons.push(
                    `Stop rule not met: the workup escalated (${loopDecision.reason}: ${loopDecision.detail})`,
                );
            } else {
                reasons.push(
                    `Stop rule not met: the workup ended in "${loopDecision.kind}" instead of a repair commit`,
                );
            }
        }

        let judge: JudgeReply | null = null;
        try {
            judge = await this.judge(
                candidate,
                claims,
                objections,
                checklist.failures,
                stopRuleMet,
                ledger,
                input.traceId,
            );
        } catch (error) {
            reasons.push(`Independent gate could not run: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (judge !== null) {
            if (judge.passed && judge.unmappedClaimIds.length > 0) {
                reasons.push(
                    `Independent gate passed while leaving claims unmapped: ${judge.unmappedClaimIds.join(', ')}`,
                );
            } else {
                reasons.push(...judge.reasons.map((reason) => `Independent gate: ${reason}`));
            }
        }

        const judgePassed = judge !== null && judge.passed && judge.unmappedClaimIds.length === 0;
        const judgeStopMet = stopRuleMet ?? judge?.stopRuleMet ?? false;
        // A stage that could not run is a failed attempt, never a pass:
        // the reasons alone do not fail the verdict, the flags do.
        const passed =
            challengerRan &&
            checklist.passed &&
            !objections.some((objection) => objection.decisive) &&
            judgePassed &&
            judgeStopMet;
        const outcome = passed ? 'pass' : attempt >= MAX_ATTEMPTS ? 'abstain' : 'retry';
        const verdict: FinishGateVerdict = {
            passed,
            outcome,
            objections,
            checklistFailures: checklist.failures,
            reasons,
        };
        if (outcome === 'abstain') {
            verdict.handoff = this.buildHandoff(claims, checklist.failures, objections, loopDecision ?? null, reasons);
        }
        this.deps.logger.info('[FinishGate] Attempt verdict', {
            attempt,
            outcome,
            reasons: verdict.reasons,
            traceId: input.traceId,
        });
        return verdict;
    }

    /**
     * One attempt over a run's evidence: synthesizes the candidate the
     * talker would speak, builds its claims from the structured evidence,
     * and gates it. The candidate is returned with the verdict so the
     * caller speaks the gated diagnosis, never a re-synthesized one.
     */
    async evaluateRun(input: FinishGateRunInput): Promise<FinishGateRunResult> {
        const candidate = synthesizeDiagnosis(
            input.visual,
            input.recalls,
            input.similar,
            input.verification,
            input.localTriage,
        );
        const claims = claimsForRun({
            diagnosis: input.visual.diagnosis,
            dtcCodes: input.dtcCodes,
            loopState: input.loopState,
            testDefinitions: input.testDefinitions,
            ledger: input.ledger,
        });
        const verdict = await this.evaluateCandidate({
            candidate,
            claims,
            ledger: input.ledger,
            loopDecision: input.loopDecision,
            attempt: input.attempt,
            traceId: input.traceId,
        });
        return { ...verdict, candidate };
    }

    /** The independent judge: a separate model call that checks the claim-to-ledger mapping and the stop rule. */
    private async judge(
        candidate: FinalDiagnosis,
        claims: DiagnosisClaim[],
        objections: ChallengerObjection[],
        checklistFailures: ChecklistFailure[],
        stopRuleMet: boolean | null,
        ledger: LedgerEntry[],
        traceId?: string,
    ): Promise<JudgeReply> {
        const result = await this.deps.gateModel.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: buildJudgePrompt(
                                candidate,
                                claims,
                                objections,
                                checklistFailures,
                                stopRuleMet,
                                citableLedgerSummaries(ledger),
                            ),
                        },
                    ],
                },
            ],
            generationConfig: { responseMimeType: 'application/json' } as unknown as GenerationConfig,
        });
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error('Empty finish-gate response');
        }
        const parsed: unknown = parseModelJson(text);
        if (!isUsableJudgeReply(parsed)) {
            throw new Error('Finish-gate response did not contain a usable verdict');
        }
        this.deps.logger.debug('[FinishGate] Independent gate verdict', {
            passed: parsed.passed,
            unmapped: parsed.unmappedClaimIds,
            traceId,
        });
        return parsed;
    }

    /**
     * Confirmed means evidence facts that checked out (codes read, tests
     * run, values measured) — never the hypothesis itself, which is what
     * is in question. Ruled out are the decisive objections.
     */
    private buildHandoff(
        claims: DiagnosisClaim[],
        failures: ChecklistFailure[],
        objections: ChallengerObjection[],
        loopDecision: LoopDecision | null,
        reasons: string[],
    ): AbstainHandoff {
        const failedClaimIds = new Set(failures.map((failure) => failure.claimId));
        return buildAbstainHandoff({
            reason: reasons.join('; ') || 'The finish gate abstained',
            confirmed: claims
                .filter((claim) => claim.kind !== 'hypothesis' && !failedClaimIds.has(claim.id))
                .map((claim) => claim.text),
            ruledOut: objections.filter((objection) => objection.decisive).map((objection) => objection.text),
            nextTest: loopDecision?.kind === 'next-test' ? loopDecision.nextTest.title : null,
            blockedReasons: reasons,
        });
    }
}
