import type { LedgerEventReference, VehicleClaim, VehicleRecord } from '../types/memory';
import { findEventById, isFactEligibleEvent, isModelSourced } from './ledgerReference';

/**
 * Hourly verifier (LM-31): re-checks new vehicle facts against ledger
 * evidence and flags orphans. A fact is an orphan when any of its cited
 * ledger events is missing, model-sourced, or of a type that may never
 * source a vehicle fact (a safety stop, for example, is not a fact about
 * the vehicle). This keeps verification consistent with the write policy.
 */

export interface VehicleFactVerification {
    checked: number;
    orphans: string[];
}

export function isOrphanClaim(claim: VehicleClaim, ledgerEvents: ReadonlyArray<LedgerEventReference>): boolean {
    for (const eventId of claim.sourceEventIds) {
        const event = findEventById(ledgerEvents, eventId);
        if (!event) return true;
        if (isModelSourced(event)) return true;
        if (!isFactEligibleEvent(event)) return true;
    }
    return false;
}

export function verifyVehicleFacts(
    record: VehicleRecord,
    ledgerEvents: ReadonlyArray<LedgerEventReference>,
    since?: string,
): VehicleFactVerification {
    const orphans: string[] = [];
    let checked = 0;
    for (const claim of record.claims) {
        if (claim.status !== 'active') continue;
        if (since && claim.createdAt < since) continue;
        checked += 1;
        if (isOrphanClaim(claim, ledgerEvents)) {
            orphans.push(claim.claimId);
        }
    }
    return { checked, orphans };
}
