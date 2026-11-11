import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import { SHARED_CONFIG } from '../config';
import type { MemoryVersion, PlaybookCandidate, ReflectionOutput } from '../types/learnedMemory';
import { ReflectionOutputSchema } from '../types/learnedMemory';
import type { CaseReference, LedgerEventReference, VehicleClaim, VehicleRecord } from '../types/memory';
import { isConfirmedOutcomeEvent } from './ledgerReference';
import { createMemoryVersion } from './memoryVersions';
import { verifyVehicleFacts } from './verifier';

/**
 * Nightly case review ("dream", LM-31). Runs per tech and per shop over the
 * day's closed cases. Every output is stamped `reflection_only`: the
 * synthesis may shape tone and next-test ordering, but it may never write a
 * vehicle fact, a diagnosis, or a probability. Playbook candidates promote
 * only through confirmed repairs (LM-23). The ledger is never edited.
 */

const FORBIDDEN_REFLECTION_KEYS = [
    'vehicleFacts',
    'vehicle_facts',
    'vehicleFact',
    'vehicle_fact',
    'diagnoses',
    'diagnosis',
    'probabilities',
    'probability',
];

/**
 * Validates a nightly-review output. Rejects any authority other than
 * reflection_only, and rejects any payload that tries to carry a vehicle
 * fact, a diagnosis, or a probability.
 */
export function validateReflectionOutput(output: unknown): ReflectionOutput {
    if (typeof output === 'object' && output !== null) {
        for (const key of FORBIDDEN_REFLECTION_KEYS) {
            if (key in output) {
                throw new AppError(ErrorCode.FORBIDDEN, `Reflection output may never carry ${key}.`);
            }
        }
    }
    const parsed = ReflectionOutputSchema.safeParse(output);
    if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid reflection output: ${parsed.error.message}`);
    }
    return parsed.data;
}

export interface NightlyReviewInput {
    date: string;
    shopId: string;
    techId?: string;
    closedCases: ReadonlyArray<CaseReference>;
    ledgerEvents: ReadonlyArray<LedgerEventReference>;
    record: VehicleRecord | null;
    proposedCandidates: ReadonlyArray<PlaybookCandidate>;
    confirmedRepairs: ReadonlyArray<{ family: string; caseId: string; ledgerEventId: string }>;
    synthesis: string;
    now: string;
    /**
     * Versioning: when versionId is given, the run writes a new candidate
     * memory version holding the report, with a diff against
     * previousVersion. Omit versionId when the caller only needs the
     * report (for example, a dry run).
     */
    previousVersion?: MemoryVersion | null;
    versionId?: string;
}

export interface NightlyReviewResult {
    report: ReflectionOutput;
    retiredClaims: VehicleClaim[];
    acceptedCandidates: PlaybookCandidate[];
    wikiFamilies: string[];
    /** Null when the caller did not ask for a version (no versionId). */
    version: MemoryVersion | null;
}

/**
 * Counts overrides and corrections as telemetry: the number of reviewed
 * cases with at least one tech-sourced correction (overrides) and at least
 * one correction of any source (corrections). Case counts, not event
 * counts: two corrections in one case are still one case with a
 * correction, so the rates below can never exceed 1. The rate is recorded
 * only; it never gates or tunes the review.
 */
export function reviewTelemetry(ledgerEvents: ReadonlyArray<LedgerEventReference>): {
    overrides: number;
    corrections: number;
} {
    const correctionCases = new Set<string>();
    const overrideCases = new Set<string>();
    for (const event of ledgerEvents) {
        if (event.type !== 'correction') continue;
        correctionCases.add(event.caseId);
        if (event.source === 'tech') overrideCases.add(event.caseId);
    }
    return { overrides: overrideCases.size, corrections: correctionCases.size };
}

export function runNightlyReview(input: NightlyReviewInput): NightlyReviewResult {
    const telemetry = reviewTelemetry(input.ledgerEvents);
    const retiredClaims: VehicleClaim[] = [];
    if (input.record) {
        const { orphans } = verifyVehicleFacts(input.record, input.ledgerEvents);
        for (const claimId of orphans) {
            const claim = input.record.claims.find((candidate) => candidate.claimId === claimId);
            if (claim) {
                retiredClaims.push({ ...claim, status: 'retired', updatedAt: input.now });
            }
        }
    }

    const closedCaseIds = new Set(input.closedCases.map((entry) => entry.caseId));
    const acceptedCandidates: PlaybookCandidate[] = [];
    for (const candidate of input.proposedCandidates) {
        if (!candidate.confirmedByRepair) continue;
        if (!candidate.sourceCaseIds.every((caseId) => closedCaseIds.has(caseId))) continue;
        const hasConfirmedOutcome = candidate.sourceEventIds.some((eventId) => {
            const event = input.ledgerEvents.find((entry) => entry.eventId === eventId);
            // The confirming outcome must come from a case the candidate
            // cites: an outcome from an unrelated case proves nothing
            // about this lesson.
            return (
                event !== undefined && isConfirmedOutcomeEvent(event) && candidate.sourceCaseIds.includes(event.caseId)
            );
        });
        if (!hasConfirmedOutcome) continue;
        acceptedCandidates.push(candidate);
    }

    const wikiFamilies = [...new Set(input.confirmedRepairs.map((repair) => repair.family))];

    const report = validateReflectionOutput({
        authority: SHARED_CONFIG.MEMORY.REFLECTION_AUTHORITY,
        kind: 'nightly_review',
        date: input.date,
        shopId: input.shopId,
        techId: input.techId,
        telemetry: {
            casesReviewed: input.closedCases.length,
            overrides: telemetry.overrides,
            corrections: telemetry.corrections,
            // Clamped: events may name cases outside the reviewed set, so
            // the share can never exceed 1 even on unexpected input.
            overrideRate:
                input.closedCases.length > 0 ? Math.min(1, telemetry.overrides / input.closedCases.length) : 0,
            correctionRate:
                input.closedCases.length > 0 ? Math.min(1, telemetry.corrections / input.closedCases.length) : 0,
        },
        synthesis: input.synthesis,
        playbookCandidates: acceptedCandidates,
        retiredClaimIds: retiredClaims.map((claim) => claim.claimId),
        wikiFamilies,
    });

    const version =
        input.versionId === undefined
            ? null
            : createMemoryVersion(
                  input.previousVersion ?? null,
                  'shop',
                  input.shopId,
                  report,
                  input.now,
                  input.versionId,
              );

    return { report, retiredClaims, acceptedCandidates, wikiFamilies, version };
}

/**
 * Cadence follows change: open concerns and mileage-dependent items are
 * reviewed nightly; fixed specs rarely. A night with no closed cases and no
 * open concerns has nothing to review.
 */
export function nightlyReviewDue(input: {
    closedCases: number;
    openConcerns: number;
    mileageDependentOpen: number;
}): boolean {
    return input.closedCases > 0 || input.openConcerns > 0 || input.mileageDependentOpen > 0;
}
