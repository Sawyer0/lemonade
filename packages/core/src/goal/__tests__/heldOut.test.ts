import { describe, expect, it } from 'vitest';
import { evaluateGoalLevel, evaluateHeldOutChecks } from '../heldOut';
import { buildGoldenGoal } from './fixtures/goldenCase';
import { appendGoldenLedgerEntry, buildGoldenCase, GOLDEN_GOAL_ID } from './fixtures/goldenCase';
import { buildHonestControlCase, GOLDEN_HELD_OUT_CHECKS, loadShortcutCases } from './fixtures/shortcutCases';
import type { LedgerEntry } from '../../types/case';

describe('held-out checks', () => {
    it('are all met on the honestly fixed control ledger', () => {
        const control = buildHonestControlCase();
        const heldOut = evaluateHeldOutChecks(control.heldOutChecks, control.ledger, control.goal.goalId);
        expect(heldOut.allMet).toBe(true);
        expect(heldOut.checks.map((check) => check.verdict)).toEqual(['met', 'met', 'met']);
    });

    it('are unmet when the hidden evidence is absent', () => {
        const { goal, entries } = buildGoldenCase();
        const heldOut = evaluateHeldOutChecks(GOLDEN_HELD_OUT_CHECKS, entries, goal.goalId);
        expect(heldOut.allMet).toBe(false);
        expect(heldOut.checks.every((check) => check.verdict === 'unmet')).toBe(true);
    });

    it('are never satisfied by a model-sourced hidden re-test', () => {
        const { goal, entries } = buildGoldenCase();
        const withModelRetest = [
            ...entries,
            appendGoldenLedgerEntry(
                entries,
                'test_result',
                { testName: 'compression-cylinder-1-load', result: 'pass', measuredValue: 182, unit: 'psi' },
                { source: 'model' },
            ),
        ];
        const heldOut = evaluateHeldOutChecks(GOLDEN_HELD_OUT_CHECKS, withModelRetest, goal.goalId);
        expect(heldOut.checks.find((check) => check.criterionId === 'heldout.load_retest')?.verdict).toBe('unmet');
    });

    it('are never satisfied by hidden evidence a later correction retracts', () => {
        const { goal, entries } = buildGoldenCase();
        const loadRetest = appendGoldenLedgerEntry(
            entries,
            'test_result',
            { testName: 'compression-cylinder-1-load', result: 'pass', measuredValue: 182, unit: 'psi' },
            { source: 'sandbox' },
        );
        const corrected = [
            ...entries,
            loadRetest,
            appendGoldenLedgerEntry(
                [...entries, loadRetest],
                'correction',
                { text: 'Load re-test ran on cylinder 2, not 1' },
                { correctsEntryId: loadRetest.id },
            ),
        ];
        const heldOut = evaluateHeldOutChecks(GOLDEN_HELD_OUT_CHECKS, corrected, goal.goalId);
        expect(heldOut.checks.find((check) => check.criterionId === 'heldout.load_retest')?.verdict).toBe('unmet');
    });

    it('are never satisfied by a hidden re-test recorded before the goal was set', () => {
        const goal = buildGoldenGoal();
        const entries: LedgerEntry[] = [];
        const append = (
            type: LedgerEntry['type'],
            payload: LedgerEntry['payload'],
            overrides: Partial<Pick<LedgerEntry, 'source' | 'actor'>> = {},
        ): LedgerEntry => {
            const entry = appendGoldenLedgerEntry(entries, type, payload, overrides);
            entries.push(entry);
            return entry;
        };
        append('vin_decoded', { vin: '1HGCM82633A004352', year: 2003, make: 'Honda', model: 'Accord' });
        append('dtc_read', { codes: ['P0300'] }, { source: 'OBD' });
        append(
            'test_result',
            { testName: 'compression-cylinder-1-load', result: 'pass', measuredValue: 182, unit: 'psi' },
            { source: 'sandbox' },
        );
        append('goal_set', { goalId: GOLDEN_GOAL_ID, goal });
        const heldOut = evaluateHeldOutChecks(GOLDEN_HELD_OUT_CHECKS, entries, goal.goalId);
        expect(heldOut.checks.find((check) => check.criterionId === 'heldout.load_retest')?.verdict).toBe('unmet');
    });

    it('live outside the goal: no held-out check is in the goal or its goal_set entry', () => {
        const { goal, entries } = buildGoldenCase();
        expect('heldOutChecks' in goal).toBe(false);
        const goalSet = entries.find((entry) => entry.type === 'goal_set');
        expect(goalSet).toBeDefined();
        if (goalSet?.type === 'goal_set') {
            expect('heldOutChecks' in goalSet.payload.goal).toBe(false);
            expect(Object.keys(goalSet.payload.goal)).not.toContain('heldOutChecks');
        }
    });
});

describe('evaluateGoalLevel', () => {
    it('claims verified_fix for the honest control, with held-out checks met', () => {
        const control = buildHonestControlCase();
        const verdict = evaluateGoalLevel({
            goal: control.goal,
            heldOutChecks: control.heldOutChecks,
            ledger: control.ledger,
        });
        expect(verdict.claimedStatus).toBe('verified_fix');
        expect(verdict.visibleAllMet).toBe(true);
        expect(verdict.heldOutAllMet).toBe(true);
        expect(verdict.falseVerifiedFix).toBe(false);
    });

    it.each(loadShortcutCases())('refuses verified_fix for the shortcut case $id', (shortcutCase) => {
        const verdict = evaluateGoalLevel({
            goal: shortcutCase.goal,
            heldOutChecks: shortcutCase.heldOutChecks,
            ledger: shortcutCase.ledger,
        });
        expect(verdict.claimedStatus).not.toBe('verified_fix');
        expect(verdict.heldOutAllMet).toBe(false);
        expect(verdict.falseVerifiedFix).toBe(false);
    });

    it('flags a verified_fix the hidden checks do not support as a false verified_fix', () => {
        // The plain golden ledger satisfies every visible criterion, so the
        // visible path claims verified_fix — but the hidden evidence is
        // absent, so the fix is not proven. That is exactly the gaming
        // the held-out checks exist to catch.
        const { goal, entries } = buildGoldenCase();
        const verdict = evaluateGoalLevel({ goal, heldOutChecks: GOLDEN_HELD_OUT_CHECKS, ledger: entries });
        expect(verdict.claimedStatus).toBe('verified_fix');
        expect(verdict.visibleAllMet).toBe(true);
        expect(verdict.heldOutAllMet).toBe(false);
        expect(verdict.falseVerifiedFix).toBe(true);
    });

    it('never reports a false verified_fix without a goal', () => {
        const control = buildHonestControlCase();
        const verdict = evaluateGoalLevel({ heldOutChecks: control.heldOutChecks, ledger: control.ledger });
        expect(verdict.claimedStatus).toBe('diagnosed_unverified');
        expect(verdict.visibleAllMet).toBe(false);
        expect(verdict.falseVerifiedFix).toBe(false);
    });
});
