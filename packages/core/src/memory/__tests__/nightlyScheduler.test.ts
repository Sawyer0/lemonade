import { describe, it, expect } from 'vitest';
import { checkNightlyRun, trimOverBudgetInput } from '../nightlyScheduler';

const SHOP = 'shop-1';
const NOW = '2026-11-12T08:00:00.000Z';

describe('checkNightlyRun', () => {
    it('is ok when last night ran', () => {
        expect(
            checkNightlyRun({
                lastSuccessfulRunDate: '2026-11-12',
                lastAttemptFailed: false,
                today: '2026-11-12',
                shopId: SHOP,
                now: NOW,
            }),
        ).toEqual({ status: 'ok' });
    });

    it('raises a missed-night alert with a retry when last night never ran', () => {
        const outcome = checkNightlyRun({
            lastSuccessfulRunDate: '2026-11-10',
            lastAttemptFailed: false,
            today: '2026-11-12',
            shopId: SHOP,
            now: NOW,
        });
        expect(outcome.status).toBe('missed');
        if (outcome.status !== 'missed') return;
        expect(outcome.alert.reason).toBe('missed');
        expect(outcome.alert.retryCount).toBe(1);
        expect(outcome.alert.date).toBe('2026-11-12');
    });

    it('raises a failed-night alert with a retry when the last attempt failed', () => {
        const outcome = checkNightlyRun({
            lastSuccessfulRunDate: '2026-11-10',
            lastAttemptFailed: true,
            today: '2026-11-12',
            shopId: SHOP,
            now: NOW,
        });
        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') return;
        expect(outcome.alert.reason).toBe('failed');
        expect(outcome.alert.retryCount).toBe(1);
    });

    it('is ok when a success was recorded today even though an attempt failed', () => {
        expect(
            checkNightlyRun({
                lastSuccessfulRunDate: '2026-11-12',
                lastAttemptFailed: true,
                today: '2026-11-12',
                shopId: SHOP,
                now: NOW,
            }),
        ).toEqual({ status: 'ok' });
    });

    it('counts retries up from previous attempts instead of always reporting one', () => {
        const outcome = checkNightlyRun({
            lastSuccessfulRunDate: '2026-11-10',
            lastAttemptFailed: true,
            today: '2026-11-12',
            shopId: SHOP,
            now: NOW,
            previousRetries: 2,
        });
        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') return;
        expect(outcome.alert.retryCount).toBe(3);
    });
});

describe('trimOverBudgetInput', () => {
    it('trims over-budget input with a covered-until marker instead of failing', () => {
        const trimmed = trimOverBudgetInput('x'.repeat(100), 10, 'event e-42');
        expect(trimmed.text.length).toBeLessThanOrEqual(10);
        expect(trimmed.coveredUntil).toBe('event e-42');
    });

    it('leaves in-budget input alone and marks it complete', () => {
        expect(trimOverBudgetInput('short', 10, 'event e-42')).toEqual({
            text: 'short',
            coveredUntil: 'complete',
        });
    });
});
