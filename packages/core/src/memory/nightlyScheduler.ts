import type { NightlyAlert } from '../types/learnedMemory';
import { truncateToBudget } from './scopes';

/**
 * Nightly scheduler (LM-31). A missed or failed night raises an alert and is
 * retried. Over-budget input is trimmed with a covered-until marker instead
 * of failing.
 */

export interface NightlyRunCheck {
    lastSuccessfulRunDate: string | null;
    lastAttemptFailed: boolean;
    today: string;
    shopId: string;
    techId?: string;
    now: string;
    /** Retries already attempted for this night; the new alert counts one more. */
    previousRetries?: number;
}

export type NightlyRunOutcome =
    { status: 'ok' } | { status: 'missed'; alert: NightlyAlert } | { status: 'failed'; alert: NightlyAlert };

export function checkNightlyRun(input: NightlyRunCheck): NightlyRunOutcome {
    // The caller invokes this after the nightly window, when a run was
    // expected: this classifies the night, it does not schedule anything.
    // A null last success (brand-new shop) still reports missed: no run
    // happened. Retry execution belongs to the future nightly job.
    // A success recorded today wins over a stale failure flag: the night
    // did run, whatever an earlier attempt did.
    const retryCount = (input.previousRetries ?? 0) + 1;
    if (input.lastSuccessfulRunDate === input.today) {
        return { status: 'ok' };
    }
    if (input.lastAttemptFailed) {
        return {
            status: 'failed',
            alert: {
                alertId: `alert-${input.today}-${input.shopId}-failed-${retryCount}`,
                reason: 'failed',
                date: input.today,
                shopId: input.shopId,
                techId: input.techId,
                retryCount,
                createdAt: input.now,
            },
        };
    }
    return {
        status: 'missed',
        alert: {
            alertId: `alert-${input.today}-${input.shopId}-missed-${retryCount}`,
            reason: 'missed',
            date: input.today,
            shopId: input.shopId,
            techId: input.techId,
            retryCount,
            createdAt: input.now,
        },
    };
}

export interface TrimmedInput {
    text: string;
    coveredUntil: string;
}

/** Trims over-budget input and marks how far it covers, instead of failing. */
export function trimOverBudgetInput(text: string, budgetChars: number, coveredThrough: string): TrimmedInput {
    if (text.length <= budgetChars) {
        return { text, coveredUntil: 'complete' };
    }
    return { text: truncateToBudget(text, budgetChars), coveredUntil: coveredThrough };
}
