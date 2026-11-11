import type { ITechProfileStore, IVehicleRecordStore } from '../interfaces/IMemoryScopeStore';
import type { TechProfile, VehicleRecord } from '../types/memory';
import { techProfileBudgetChars, truncateToBudget, vehicleSummaryBudgetChars } from './scopes';

/**
 * Session-start memory injection (LM-31). The tech profile is injected at
 * session start and frozen for the session; the vehicle summary is always on.
 * The same VIN at another shop sees nothing: the record key is shop + VIN.
 */

export interface SessionMemoryInput {
    shopId: string;
    vin: string;
    techId: string;
}

export interface SessionMemory {
    techProfileText: string;
    vehicleSummaryText: string;
    vehicleRecordFound: boolean;
}

export function renderTechProfile(profile: TechProfile): string {
    const lines = [
        `Skill level: ${profile.skillLevel}.`,
        `Units: ${profile.units}.`,
        `Tools on hand: ${profile.toolsOnHand.length > 0 ? profile.toolsOnHand.join(', ') : 'none recorded'}.`,
        `Detail preference: ${profile.detailPreference}.`,
    ];
    for (const fact of profile.facts) {
        lines.push(`Remember: ${fact.text}`);
    }
    return truncateToBudget(lines.join('\n'), techProfileBudgetChars());
}

export function renderVehicleSummary(record: VehicleRecord): string {
    const budget = vehicleSummaryBudgetChars();
    if (record.summary.trim().length > 0) {
        return truncateToBudget(record.summary.trim(), budget);
    }
    const active = record.claims.filter((claim) => claim.status === 'active');
    if (active.length === 0) return '';
    // Reserve room for the overflow marker first, so it is never cut mid-phrase.
    const markerFor = (leftOut: number): string => `… (${leftOut} more claim${leftOut === 1 ? '' : 's'} in the ledger)`;
    const widestMarker = markerFor(active.length);
    const lines: string[] = [];
    let remaining = budget - widestMarker.length - 1;
    let included = 0;
    for (const claim of active) {
        const line = `- ${claim.text}`;
        if (line.length + 1 > remaining) break;
        lines.push(line);
        remaining -= line.length + 1;
        included += 1;
    }
    const leftOut = active.length - included;
    if (leftOut > 0) {
        lines.push(markerFor(leftOut));
    }
    return lines.join('\n');
}

export async function buildSessionMemory(
    store: ITechProfileStore & IVehicleRecordStore,
    input: SessionMemoryInput,
): Promise<SessionMemory> {
    const profile = await store.readTechProfile(input.shopId, input.techId);
    const record = await store.readVehicleRecord(input.shopId, input.vin);
    return {
        techProfileText: profile ? renderTechProfile(profile) : '',
        vehicleSummaryText: record ? renderVehicleSummary(record) : '',
        vehicleRecordFound: record !== null,
    };
}
