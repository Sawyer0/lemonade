import { describe, it, expect } from 'vitest';
import { buildGoldenCase, appendGoldenLedgerEntry } from './fixtures/goldenCase';
import {
    budgetExceeded,
    evaluatePhase,
    isTerminalGoalStatus,
    resolveTerminalStatus,
    EMPTY_BUDGET_USAGE,
    type BudgetUsage,
} from '../phaseGate';
import type { LoopDecision } from '../../diagnosis/loop/types';
import type { ReasonerRegionResult } from '../../reasoning/types';

describe('phaseGate (LM-26)', () => {
    describe('evaluatePhase', () => {
        it('marks differentiate met when the posterior is sharp', () => {
            const { goal, entries } = buildGoldenCase();
            expect(evaluatePhase(goal, entries, 'differentiate').met).toBe(true);
        });

        it('marks differentiate unmet when no hypothesis leads', () => {
            const { goal, entries } = buildGoldenCase({ hypothesisConfidences: [0.4, 0.35, 0.45] });
            const phase = evaluatePhase(goal, entries, 'differentiate');
            expect(phase.met).toBe(false);
            expect(phase.unmetBlocking.map((criterion) => criterion.criterionId)).toEqual([
                'differentiate.top_hypothesis',
            ]);
        });

        it('marks verify met only after the re-test and symptom observation', () => {
            const { goal, entries } = buildGoldenCase();
            expect(evaluatePhase(goal, entries, 'verify').met).toBe(true);
            const noRetest = buildGoldenCase({ retestResult: 'absent' });
            expect(evaluatePhase(noRetest.goal, noRetest.entries, 'verify').met).toBe(false);
        });

        it('marks a phase with no blocking criteria met vacuously', () => {
            const { goal, entries } = buildGoldenCase();
            expect(evaluatePhase(goal, entries, 'intake').met).toBe(true);
            expect(evaluatePhase(goal, entries, 'commit').met).toBe(true);
            expect(evaluatePhase(goal, entries, 'repair').met).toBe(true);
        });
    });

    describe('budgetExceeded', () => {
        it('is within budget at zero usage', () => {
            const { goal } = buildGoldenCase();
            expect(budgetExceeded(goal, EMPTY_BUDGET_USAGE)).toEqual({ exceeded: false, reason: 'within budget' });
        });

        it.each([
            ['reasoner runs', { ...EMPTY_BUDGET_USAGE, reasonerRuns: 9 }],
            ['tokens', { ...EMPTY_BUDGET_USAGE, tokensUsed: 200001 }],
            ['wall minutes', { ...EMPTY_BUDGET_USAGE, wallMinutesUsed: 61 }],
            ['test minutes', { ...EMPTY_BUDGET_USAGE, testCostMinutesUsed: 31 }],
        ])('exceeds on %s', (_label, usage: BudgetUsage) => {
            const { goal } = buildGoldenCase();
            const exceeded = budgetExceeded(goal, usage);
            expect(exceeded.exceeded).toBe(true);
            expect(exceeded.reason).toContain('exceed');
        });

        it('is within budget exactly at the limits', () => {
            const { goal } = buildGoldenCase();
            expect(
                budgetExceeded(goal, {
                    reasonerRuns: 8,
                    tokensUsed: 200000,
                    wallMinutesUsed: 60,
                    testCostMinutesUsed: 30,
                }).exceeded,
            ).toBe(false);
        });
    });

    describe('resolveTerminalStatus', () => {
        it('ends the full golden case in verified_fix', () => {
            const { goal, entries } = buildGoldenCase();
            expect(resolveTerminalStatus({ goal, ledger: entries, budgetUsage: EMPTY_BUDGET_USAGE })).toEqual({
                status: 'verified_fix',
                reason: 'every goal criterion is met, including the pre-registered re-test',
            });
        });

        it.each([
            ['no re-test entry', { retestResult: 'absent' as const }],
            ['failing re-test', { retestResult: 'fail' as const }],
            ['re-test before the goal was set', { retestBeforeGoal: true }],
            ['corrected re-test', { correctRetest: true }],
        ])('never reaches verified_fix when %s', (_label, options) => {
            const { goal, entries } = buildGoldenCase(options);
            const resolution = resolveTerminalStatus({ goal, ledger: entries, budgetUsage: EMPTY_BUDGET_USAGE });
            expect(resolution.status).toBe('diagnosed_unverified');
        });

        it('escalates when the case never differentiated', () => {
            const { goal, entries } = buildGoldenCase({ hypothesisConfidences: [0.4, 0.35, 0.45] });
            expect(resolveTerminalStatus({ goal, ledger: entries, budgetUsage: EMPTY_BUDGET_USAGE }).status).toBe(
                'escalated',
            );
        });

        it('ends budget_limited when the goal budget is spent, even with full proof', () => {
            const { goal, entries } = buildGoldenCase();
            expect(
                resolveTerminalStatus({
                    goal,
                    ledger: entries,
                    budgetUsage: { ...EMPTY_BUDGET_USAGE, tokensUsed: 200001 },
                }).status,
            ).toBe('budget_limited');
        });

        it('ends safety_stopped on a safety_stop ledger entry', () => {
            const { goal, entries } = buildGoldenCase();
            const stopped = [
                ...entries,
                appendGoldenLedgerEntry(entries, 'safety_stop', { reason: 'Fuel leak at the rail' }),
            ];
            expect(resolveTerminalStatus({ goal, ledger: stopped, budgetUsage: EMPTY_BUDGET_USAGE }).status).toBe(
                'safety_stopped',
            );
        });

        it('ends safety_stopped on a safety stop signal', () => {
            const { goal, entries } = buildGoldenCase();
            expect(
                resolveTerminalStatus({
                    goal,
                    ledger: entries,
                    budgetUsage: EMPTY_BUDGET_USAGE,
                    safetyStop: { reason: 'Tech reported fuel vapor' },
                }).status,
            ).toBe('safety_stopped');
        });

        it('ends abstained on an abstain handoff, even with full proof', () => {
            const { goal, entries } = buildGoldenCase();
            expect(
                resolveTerminalStatus({
                    goal,
                    ledger: entries,
                    budgetUsage: EMPTY_BUDGET_USAGE,
                    abstain: {
                        reason: 'Cannot distinguish coil from plug from the evidence',
                        confirmed: ['Misfire on cylinder 1'],
                        ruledOut: [],
                        nextTest: 'Measure spark at the plug',
                        escalateWhen: 'Escalate if the next test does not confirm a cause.',
                    },
                }).status,
            ).toBe('abstained');
        });

        it('ends escalated on a workup escalate decision', () => {
            const { goal, entries } = buildGoldenCase({ retestResult: 'absent' });
            const decision: LoopDecision = {
                kind: 'escalate',
                reason: 'no-discriminating-test',
                detail: 'No remaining test separates the two leaders',
            };
            expect(
                resolveTerminalStatus({
                    goal,
                    ledger: entries,
                    budgetUsage: EMPTY_BUDGET_USAGE,
                    loopDecision: decision,
                }).status,
            ).toBe('escalated');
        });

        it('lets full proof beat a workup escalation: the evidence is what was proven', () => {
            const { goal, entries } = buildGoldenCase();
            const decision: LoopDecision = {
                kind: 'escalate',
                reason: 'budget-exhausted',
                detail: 'Loop test budget spent',
            };
            expect(
                resolveTerminalStatus({
                    goal,
                    ledger: entries,
                    budgetUsage: EMPTY_BUDGET_USAGE,
                    loopDecision: decision,
                }).status,
            ).toBe('verified_fix');
        });

        it('maps a safety-critical workup escalation to safety_stopped', () => {
            const { goal, entries } = buildGoldenCase({ retestResult: 'absent' });
            const decision: LoopDecision = {
                kind: 'escalate',
                reason: 'safety-critical-unresolved',
                detail: 'Suspected fuel leak unresolved',
            };
            expect(
                resolveTerminalStatus({
                    goal,
                    ledger: entries,
                    budgetUsage: EMPTY_BUDGET_USAGE,
                    loopDecision: decision,
                }).status,
            ).toBe('safety_stopped');
        });

        it('maps reasoner end states to terminal statuses', () => {
            const { goal, entries } = buildGoldenCase({ retestResult: 'absent' });
            const reasoner = (endState: ReasonerRegionResult['endState']): ReasonerRegionResult => ({
                endState,
                endReason: 'loop ended',
                steps: [],
                citations: [],
            });
            const resolve = (reasonerResult: ReasonerRegionResult) =>
                resolveTerminalStatus({ goal, ledger: entries, budgetUsage: EMPTY_BUDGET_USAGE, reasonerResult })
                    .status;
            expect(resolve(reasoner('needs_tech'))).toBe('escalated');
            expect(resolve(reasoner('max_steps'))).toBe('escalated');
            expect(resolve(reasoner('safety_stop'))).toBe('safety_stopped');
            expect(resolve(reasoner('budget'))).toBe('budget_limited');
        });

        it('ends a goal-less run diagnosed_unverified, and escalated when the workup escalated', () => {
            const decision: LoopDecision = {
                kind: 'escalate',
                reason: 'evidence-inconsistent',
                detail: 'Evidence contradicts every hypothesis',
            };
            expect(resolveTerminalStatus({ ledger: [], budgetUsage: EMPTY_BUDGET_USAGE }).status).toBe(
                'diagnosed_unverified',
            );
            expect(
                resolveTerminalStatus({ ledger: [], budgetUsage: EMPTY_BUDGET_USAGE, loopDecision: decision }).status,
            ).toBe('escalated');
        });

        it('orders safety above budget above abstain', () => {
            const { goal, entries } = buildGoldenCase();
            const overBudget: BudgetUsage = { ...EMPTY_BUDGET_USAGE, tokensUsed: 200001 };
            const abstain = {
                reason: 'Cannot tell',
                confirmed: [],
                ruledOut: [],
                nextTest: null,
                escalateWhen: 'Escalate if the next test does not confirm a cause.',
            };
            expect(resolveTerminalStatus({ goal, ledger: entries, budgetUsage: overBudget, abstain }).status).toBe(
                'budget_limited',
            );
            const stopped = [
                ...entries,
                appendGoldenLedgerEntry(entries, 'safety_stop', { reason: 'Fuel leak at the rail' }),
            ];
            expect(resolveTerminalStatus({ goal, ledger: stopped, budgetUsage: overBudget, abstain }).status).toBe(
                'safety_stopped',
            );
        });
    });

    describe('isTerminalGoalStatus', () => {
        it('accepts the six terminal statuses and rejects the rest', () => {
            for (const status of [
                'verified_fix',
                'diagnosed_unverified',
                'abstained',
                'safety_stopped',
                'escalated',
                'budget_limited',
            ] as const) {
                expect(isTerminalGoalStatus(status)).toBe(true);
            }
            for (const status of ['active', 'needs_tech', 'paused'] as const) {
                expect(isTerminalGoalStatus(status)).toBe(false);
            }
        });
    });
});
