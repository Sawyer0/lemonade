import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import type { LedgerEventReference, VehicleClaim, VehicleRecord } from '../types/memory';
import { findEventById, isFactEligibleEvent, isModelSourced } from './ledgerReference';

/**
 * Vehicle claim policy (LM-31). Memory writes come only from ledger events.
 * A model-sourced claim never becomes a vehicle fact. A replaced vehicle
 * fact is superseded, never left standing.
 */

export type ClaimProposal = { ok: true; claim: VehicleClaim; duplicate: boolean } | { ok: false; reason: string };

export interface ClaimCandidate {
    text: string;
    sourceEventIds: string[];
    /** When set, the new claim supersedes this active claim instead of standing beside it. */
    supersedesClaimId?: string;
}

function validateClaimSources(
    candidate: ClaimCandidate,
    ledgerEvents: ReadonlyArray<LedgerEventReference>,
): string | null {
    if (candidate.text.trim().length === 0) return 'empty-claim-text';
    if (candidate.sourceEventIds.length === 0) return 'missing-source-events';
    for (const eventId of candidate.sourceEventIds) {
        const event = findEventById(ledgerEvents, eventId);
        if (!event) return `unknown-source-event:${eventId}`;
        if (isModelSourced(event)) return `model-sourced-event:${eventId}`;
        if (!isFactEligibleEvent(event)) return `ineligible-event:${eventId}`;
    }
    return null;
}

/** Process-wide sequence so two proposals from the same record state never share an id. */
let claimSequence = 0;

function buildClaim(
    record: VehicleRecord,
    candidate: ClaimCandidate,
    supersedesClaimId: string | undefined,
    now: string,
): VehicleClaim {
    claimSequence += 1;
    return {
        // Shop + VIN entropy plus a random suffix: the same timestamp and
        // record shape in another shop, for another vehicle, or in another
        // process must never produce the same id. The sequence alone is
        // process-wide and resets on restart.
        claimId: `claim-${record.shopId}-${record.vin}-${now}-${record.claims.length + 1}-${claimSequence}-${Math.random().toString(36).slice(2, 10)}`,
        shopId: record.shopId,
        vin: record.vin,
        text: candidate.text.trim(),
        sourceEventIds: [...candidate.sourceEventIds],
        supersedesClaimId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
    };
}

/** Proposes a vehicle claim from ledger evidence. Rejects model-only provenance. */
export function proposeVehicleClaim(
    record: VehicleRecord,
    candidate: ClaimCandidate,
    ledgerEvents: ReadonlyArray<LedgerEventReference>,
    now: string,
): ClaimProposal {
    const problem = validateClaimSources(candidate, ledgerEvents);
    if (problem) return { ok: false, reason: problem };
    const normalized = candidate.text.trim().toLowerCase();
    const existing = record.claims.find(
        (claim) => claim.status === 'active' && claim.text.trim().toLowerCase() === normalized,
    );
    if (existing) return { ok: true, claim: existing, duplicate: true };
    return { ok: true, claim: buildClaim(record, candidate, undefined, now), duplicate: false };
}

/** Supersedes an active claim with a new one citing ledger evidence. */
export function supersedeVehicleClaim(
    record: VehicleRecord,
    supersedesClaimId: string,
    candidate: ClaimCandidate,
    ledgerEvents: ReadonlyArray<LedgerEventReference>,
    now: string,
): ClaimProposal {
    const previous = record.claims.find((claim) => claim.claimId === supersedesClaimId && claim.status === 'active');
    if (!previous) return { ok: false, reason: `unknown-active-claim:${supersedesClaimId}` };
    const proposal = proposeVehicleClaim(record, candidate, ledgerEvents, now);
    if (!proposal.ok) return proposal;
    if (proposal.duplicate) return { ok: false, reason: 'duplicate-claim' };
    const replacement: VehicleClaim = { ...proposal.claim, supersedesClaimId };
    return { ok: true, claim: replacement, duplicate: false };
}

/** Applies a supersede to a record: the old claim stands as superseded, the new one is active. */
export function applySupersede(record: VehicleRecord, replacement: VehicleClaim, now: string): VehicleRecord {
    const previous = record.claims.find((claim) => claim.claimId === replacement.supersedesClaimId);
    if (!previous) {
        throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            `Cannot supersede claim ${replacement.supersedesClaimId ?? 'unknown'}: it is not in this record.`,
        );
    }
    if (previous.status !== 'active') {
        throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            `Cannot supersede claim ${previous.claimId}: it is ${previous.status}, not active.`,
        );
    }
    return {
        ...record,
        claims: record.claims
            .map((claim) =>
                claim.claimId === replacement.supersedesClaimId
                    ? { ...claim, status: 'superseded' as const, updatedAt: now }
                    : claim,
            )
            .concat(replacement),
        updatedAt: now,
    };
}

/** Appends a proposed claim to a record. */
export function applyClaim(record: VehicleRecord, claim: VehicleClaim, now: string): VehicleRecord {
    return { ...record, claims: [...record.claims, claim], updatedAt: now };
}
