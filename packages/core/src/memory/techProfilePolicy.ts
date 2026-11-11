import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import type {
    LedgerEventReference,
    TechFact,
    TechFactChange,
    TechProfile,
    VehicleClaim,
    VehicleRecord,
} from '../types/memory';
import {
    applyClaim,
    applySupersede,
    proposeVehicleClaim,
    supersedeVehicleClaim,
    type ClaimCandidate,
} from './vehicleClaimPolicy';

/**
 * Tech profile policy (LM-31). Profiles update at case close, from ledger
 * events only. A voice confirmation saves a fact; "forget that" or "that's
 * wrong" deletes or corrects it, and the change is logged.
 */

/** Voice confirmations are appended to the ledger as tech observations with this prefix. */
export const VOICE_CONFIRMATION_PREFIX = 'remember: ';

export interface VoiceConfirmation {
    caseId: string;
    techId: string;
    factText: string;
    confirmedAt: string;
}

/**
 * Records a voice confirmation ("Want me to remember you have a smoke
 * machine?"). The caller appends it to the ledger as a tech observation
 * carrying the confirmation prefix; the fact lands in the profile at case close.
 */
export function recordVoiceConfirmation(input: {
    caseId: string;
    techId: string;
    factText: string;
    at: string;
}): VoiceConfirmation {
    if (input.factText.trim().length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Voice confirmation needs a fact to remember.');
    }
    return {
        caseId: input.caseId,
        techId: input.techId,
        factText: input.factText.trim(),
        confirmedAt: input.at,
    };
}

/** Renders a voice confirmation as the ledger observation text the voice layer appends. */
export function confirmationObservationText(confirmation: VoiceConfirmation): string {
    return `${VOICE_CONFIRMATION_PREFIX}${confirmation.factText}`;
}

export interface CaseCloseResult {
    profile: TechProfile;
    record: VehicleRecord;
    confirmedFacts: TechFact[];
    appliedClaims: VehicleClaim[];
    rejectedClaims: { text: string; reason: string }[];
}

/**
 * Case-close write: confirmed tech facts land in the profile, proposed vehicle
 * claims land in the record. Both come only from this case's ledger events.
 */
export function applyCaseCloseUpdates(
    profile: TechProfile,
    record: VehicleRecord,
    caseEvents: ReadonlyArray<LedgerEventReference>,
    claimCandidates: ReadonlyArray<ClaimCandidate>,
    now: string,
): CaseCloseResult {
    let nextProfile = profile;
    const confirmedFacts: TechFact[] = [];
    for (const event of caseEvents) {
        if (event.type !== 'observation' || event.source !== 'tech') continue;
        const text = event.text ?? '';
        if (!text.startsWith(VOICE_CONFIRMATION_PREFIX)) continue;
        const factText = text.slice(VOICE_CONFIRMATION_PREFIX.length).trim();
        if (factText.length === 0) continue;
        const normalized = factText.toLowerCase();
        if (nextProfile.facts.some((fact) => fact.text.toLowerCase() === normalized)) continue;
        const fact: TechFact = {
            factId: `fact-${event.eventId}`,
            text: factText,
            source: 'voice_confirmation',
            confirmedAt: event.createdAt,
            sourceEventIds: [event.eventId],
        };
        confirmedFacts.push(fact);
        nextProfile = {
            ...nextProfile,
            facts: [...nextProfile.facts, fact],
            changeLog: [
                ...nextProfile.changeLog,
                {
                    factId: fact.factId,
                    action: 'confirmed' as const,
                    reason: `Voice confirmation in case ${event.caseId}.`,
                    at: now,
                },
            ],
            updatedAt: now,
        };
    }

    let nextRecord = record;
    const appliedClaims: VehicleClaim[] = [];
    const rejectedClaims: { text: string; reason: string }[] = [];
    for (const candidate of claimCandidates) {
        // A candidate that replaces a fact supersedes it: the old claim
        // stands as superseded, never beside the new one.
        if (candidate.supersedesClaimId) {
            const proposal = supersedeVehicleClaim(nextRecord, candidate.supersedesClaimId, candidate, caseEvents, now);
            if (!proposal.ok) {
                rejectedClaims.push({ text: candidate.text, reason: proposal.reason });
                continue;
            }
            nextRecord = applySupersede(nextRecord, proposal.claim, now);
            appliedClaims.push(proposal.claim);
            continue;
        }
        const proposal = proposeVehicleClaim(nextRecord, candidate, caseEvents, now);
        if (!proposal.ok) {
            rejectedClaims.push({ text: candidate.text, reason: proposal.reason });
            continue;
        }
        if (proposal.duplicate) continue;
        nextRecord = applyClaim(nextRecord, proposal.claim, now);
        appliedClaims.push(proposal.claim);
    }

    return { profile: nextProfile, record: nextRecord, confirmedFacts, appliedClaims, rejectedClaims };
}

export interface ForgetFactInput {
    action: 'forgotten' | 'corrected';
    replacementText?: string;
    reason: string;
    at: string;
}

/**
 * "Forget that" or "that's wrong", spoken or in the app: deletes the fact, or
 * corrects it when a replacement is given. The change is logged on the profile.
 */
export function forgetTechFact(
    profile: TechProfile,
    factId: string,
    input: ForgetFactInput,
): { profile: TechProfile; change: TechFactChange } {
    const fact = profile.facts.find((candidate) => candidate.factId === factId);
    if (!fact) {
        throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Tech fact ${factId} does not exist.`);
    }
    if (input.reason.trim().length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Forgetting a fact needs a reason.');
    }
    if (input.action === 'corrected' && (input.replacementText ?? '').trim().length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Correcting a fact needs replacement text.');
    }
    const change: TechFactChange = {
        factId,
        action: input.action,
        reason: input.reason,
        previousText: input.action === 'corrected' ? fact.text : undefined,
        at: input.at,
    };
    const facts =
        input.action === 'corrected'
            ? profile.facts.map((candidate) =>
                  candidate.factId === factId
                      ? {
                            ...candidate,
                            text: (input.replacementText as string).trim(),
                            confirmedAt: input.at,
                        }
                      : candidate,
              )
            : profile.facts.filter((candidate) => candidate.factId !== factId);
    return {
        profile: { ...profile, facts, changeLog: [...profile.changeLog, change], updatedAt: input.at },
        change,
    };
}
