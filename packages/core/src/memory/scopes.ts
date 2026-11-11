import { SHARED_CONFIG } from '../config';
import type { MemoryScope } from '../types/memory';

/**
 * Memory scopes (LM-31): owners, keys, and injection budgets. Users configure
 * nothing; memory fills itself from the work. The shop holds the vehicle record.
 */

export const SCOPE_OWNERS: Record<MemoryScope, string> = {
    tech_profile: 'shop account, about the tech',
    vehicle_record: 'the shop, keyed by shop + VIN',
    shop: 'the shop',
    global_priors: 'opted-in shops, anonymized aggregates only',
};

export function techProfileKey(shopId: string, techId: string): string {
    return `${shopId}/${techId}`;
}

export function vehicleRecordKey(shopId: string, vin: string): string {
    return `${shopId}/${vin.toUpperCase()}`;
}

export function shopSettingsKey(shopId: string): string {
    return shopId;
}

export function isGlobalPriorsEnabled(): boolean {
    return SHARED_CONFIG.MEMORY.GLOBAL_PRIORS_ENABLED;
}

/** Truncates injected text to its budget, leaving a marker instead of failing silently. */
export function truncateToBudget(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function techProfileBudgetChars(): number {
    return SHARED_CONFIG.MEMORY.TECH_PROFILE_MAX_CHARS;
}

export function vehicleSummaryBudgetChars(): number {
    return SHARED_CONFIG.MEMORY.VEHICLE_SUMMARY_MAX_CHARS;
}
