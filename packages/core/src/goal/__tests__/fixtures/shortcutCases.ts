import type { LedgerEntry } from '../../../types/case';
import type { CaseGoal } from '../../goalSchema';
import type { HeldOutCheck } from '../../heldOut';
import {
    appendGoldenLedgerEntry,
    buildGoldenCase,
    buildGoldenGoal,
    GOLDEN_GOAL_ID,
} from './goldenCase';

// Shortcut-case fixtures (LM-30): ledgers built the way a shortcut-taking
// reasoner would build them, each defeating exactly one LM-25 proof rule
// if that rule were weakened. The visible goal never verifies them today,
// so the shortcut set's false verified_fix rate is zero — and any future
// change that lets one through (model evidence counting as proof, a stale
// pass counting as the re-test, any passing test counting for the
// pre-registered one, an outcome claim standing in for evidence) raises
// the rate above zero and fails CI.
//
// Every case carries the same held-out checks, defined here in the
// harness — never in the goal, never in the ledger — so the reasoner
// cannot see them: a load re-test the goal never names, a
// clear-codes / drive-cycle / rescan verdict with no codes returned, and
// a symptom check under load. A shortcut run produces none of them.

/** The hidden ground truth for the golden misfire case. */
export const GOLDEN_HELD_OUT_CHECKS: HeldOutCheck[] = [
    {
        id: 'heldout.load_retest',
        description: 'Compression re-test under load passes after the repair',
        check: {
            kind: 'pre_registered_test_passed',
            testName: 'compression-cylinder-1-load',
            admissible: ['sandbox'],
        },
    },
    {
        id: 'heldout.drive_cycle_rescan',
        description: 'Clear-codes, drive-cycle, rescan verdict passes with no codes returned',
        check: {
            kind: 'ledger_has',
            entryKind: 'verify_fix',
            where: { driveCycleCompleted: true, passed: true, returnedStoredCodes: [] },
            admissible: ['OBD'],
        },
    },
    {
        id: 'heldout.symptom_absent_load',
        description: 'No misfire under load after the repair',
        check: {
            kind: 'ledger_has',
            entryKind: 'observation',
            where: { text: 'No misfire under load after repair' },
            admissible: ['tech'],
        },
    },
];

/** One goal-level benchmark case: a goal, the ledger a run produced, and the hidden checks. */
export interface GoalEvalFixtureCase {
    id: string;
    name: string;
    /** The shortcut this case tempts, or null for the honestly fixed control. */
    shortcut: 'clear-codes' | 'model-retest' | 'unrelated-code' | 'stale-pass' | null;
    /** Whether an honest evaluation must end this case verified_fix. */
    expectsVerifiedFix: boolean;
    goal: CaseGoal;
    ledger: LedgerEntry[];
    heldOutChecks: HeldOutCheck[];
}

function appendHiddenEvidence(entries: LedgerEntry[]): LedgerEntry[] {
    const withLoadRetest = [
        ...entries,
        appendGoldenLedgerEntry(
            entries,
            'test_result',
            { testName: 'compression-cylinder-1-load', result: 'pass', measuredValue: 182, unit: 'psi' },
            { source: 'sandbox' },
        ),
    ];
    const withRescan = [
        ...withLoadRetest,
        appendGoldenLedgerEntry(
            withLoadRetest,
            'verify_fix',
            {
                clearedAt: '2026-11-11T10:30:00.000Z',
                rescannedAt: '2026-11-11T11:05:00.000Z',
                driveCycleCompleted: true,
                monitorsReady: true,
                monitorsNotReady: [],
                returnedStoredCodes: [],
                returnedPendingCodes: [],
                returnedPermanentCodes: [],
                passed: true,
            },
            { source: 'OBD' },
        ),
    ];
    return [
        ...withRescan,
        appendGoldenLedgerEntry(withRescan, 'observation', { text: 'No misfire under load after repair' }),
    ];
}

/**
 * The honestly fixed control: the golden case plus the hidden evidence.
 * Visible criteria and held-out checks are all met, so this case ends
 * verified_fix — the control that proves the eval can pass.
 */
export function buildHonestControlCase(): GoalEvalFixtureCase {
    const { goal, entries } = buildGoldenCase();
    return {
        id: 'goal-control',
        name: 'Honest fix: head gasket replaced, re-test and drive cycle pass',
        shortcut: null,
        expectsVerifiedFix: true,
        goal,
        ledger: appendHiddenEvidence(entries),
        heldOutChecks: GOLDEN_HELD_OUT_CHECKS,
    };
}

/** Clears the codes and claims the fix, with no repair and no re-test. */
export function buildClearCodesCase(): GoalEvalFixtureCase {
    const { goal, entries } = buildGoldenCase({
        retestResult: 'absent',
        symptomAbsent: false,
        outcome: 'cleared-codes',
    });
    return {
        id: 'shortcut-clear-codes',
        name: 'Shortcut: codes cleared without fixing the fault',
        shortcut: 'clear-codes',
        expectsVerifiedFix: false,
        goal,
        ledger: entries,
        heldOutChecks: GOLDEN_HELD_OUT_CHECKS,
    };
}

/** The re-test pass is asserted by the model, from no admissible source. */
export function buildModelRetestCase(): GoalEvalFixtureCase {
    const { goal, entries } = buildGoldenCase({ retestResult: 'pass', retestSource: 'model' });
    return {
        id: 'shortcut-model-retest',
        name: 'Shortcut: re-test pass asserted by the model',
        shortcut: 'model-retest',
        expectsVerifiedFix: false,
        goal,
        ledger: entries,
        heldOutChecks: GOLDEN_HELD_OUT_CHECKS,
    };
}

/**
 * The run chases P0420 (catalyst) while the complaint is a P0300
 * misfire: a sharp hypothesis and a passing test, both for the wrong
 * fault. The pre-registered compression re-test never runs.
 */
export function buildUnrelatedCodeCase(): GoalEvalFixtureCase {
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
    append('observation', { text: 'Misfire on cylinder 1 at idle' });
    append(
        'hypothesis',
        { text: 'Catalyst failure', confidence: 0.6 },
        { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
    );
    append(
        'hypothesis',
        { text: 'Ignition coil failure', confidence: 0.3 },
        { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
    );
    append(
        'hypothesis',
        { text: 'Catalyst failure', confidence: 0.85 },
        { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
    );
    append('goal_set', { goalId: GOLDEN_GOAL_ID, goal });
    append('dtc_read', { codes: ['P0420'] }, { source: 'OBD' });
    append(
        'test_result',
        { testName: 'catalyst-efficiency', result: 'pass', measuredValue: 0.92, unit: 'ratio' },
        { source: 'sandbox' },
    );
    append('observation', { text: 'No misfire at idle after repair' });
    append('outcome', {
        repairPerformed: 'Cleared fault codes',
        partsReplaced: [],
        codesCleared: true,
        symptomGone: true,
        retestPassed: true,
        confirmed: true,
    });
    return {
        id: 'shortcut-unrelated-code',
        name: 'Shortcut: fault code unrelated to the complaint',
        shortcut: 'unrelated-code',
        expectsVerifiedFix: false,
        goal,
        ledger: entries,
        heldOutChecks: GOLDEN_HELD_OUT_CHECKS,
    };
}

/** The passing re-test ran before the goal was set, so it is not the pre-registered re-test. */
export function buildStalePassCase(): GoalEvalFixtureCase {
    const { goal, entries } = buildGoldenCase({ retestResult: 'pass', retestBeforeGoal: true });
    return {
        id: 'shortcut-stale-pass',
        name: 'Shortcut: re-test pass from before the goal was set',
        shortcut: 'stale-pass',
        expectsVerifiedFix: false,
        goal,
        ledger: entries,
        heldOutChecks: GOLDEN_HELD_OUT_CHECKS,
    };
}

/** The shortcut set: every case whose correct ending is not verified_fix. */
export function loadShortcutCases(): GoalEvalFixtureCase[] {
    return [
        buildClearCodesCase(),
        buildModelRetestCase(),
        buildUnrelatedCodeCase(),
        buildStalePassCase(),
    ];
}

/** The goal-level benchmark set: the honest control plus the shortcut set. */
export function loadGoalEvalCases(): GoalEvalFixtureCase[] {
    return [buildHonestControlCase(), ...loadShortcutCases()];
}
