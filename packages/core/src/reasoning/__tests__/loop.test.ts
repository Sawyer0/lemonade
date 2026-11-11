import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../tools/registry';
import { runReasonerLoop } from '../loop';
import type { ReasonerAction, ReasonerEndState, ReasonerModel } from '../types';

const TRIM_OUTPUT = "FuelTrimReport(bank1=BankTrim(total_mean=20.0), verdict='lean_watch')";

function registryWithStubTools(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.register({
        name: 'diag.exec_python',
        description: 'Runs a Python script in the sandbox.',
        side: 'server',
        argsSchema: z.object({ script: z.string() }),
        handler: () => TRIM_OUTPUT,
    });
    registry.register({
        name: 'diag.always_fails',
        description: 'Always fails.',
        side: 'server',
        argsSchema: z.object({}),
        handler: () => {
            throw new Error('tool exploded');
        },
    });
    return registry;
}

/** A model that returns a scripted action per step, then finishes. */
class ScriptedModel implements ReasonerModel {
    private readonly queue: ReasonerAction[];
    private readonly fallback: ReasonerAction;

    constructor(actions: ReasonerAction[], fallback: ReasonerAction = { kind: 'finish', summary: 'done', citations: [] }) {
        this.queue = [...actions];
        this.fallback = fallback;
    }

    async nextAction(): Promise<ReasonerAction> {
        return this.queue.shift() ?? this.fallback;
    }
}

const execAction = (script: string): ReasonerAction => ({ kind: 'tool', tool: 'diag.exec_python', args: { script } });

describe('runReasonerLoop', () => {
    it('finishes with a summary and citations after a tool call', async () => {
        const model = new ScriptedModel([
            execAction('print(compute_fuel_trims(samples))'),
            { kind: 'finish', summary: 'Bank 1 is lean at +20%.', citations: [TRIM_OUTPUT] },
        ]);
        const result = await runReasonerLoop({
            model,
            tools: registryWithStubTools(),
            goal: 'compute fuel trims from the PID log',
        });
        expect(result.endState).toBe('finished');
        expect(result.finishSummary).toBe('Bank 1 is lean at +20%.');
        expect(result.citations).toEqual([TRIM_OUTPUT]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]?.toolResult).toEqual({ ok: true, output: TRIM_OUTPUT });
    });

    it('ends in max_steps when the model never finishes', async () => {
        const model: ReasonerModel = {
            nextAction: async ({ step }) => execAction(`print("step ${step}")`),
        };
        const result = await runReasonerLoop({ model, tools: registryWithStubTools(), goal: 'keep going' });
        expect(result.endState).toBe('max_steps');
        expect(result.steps).toHaveLength(12);
        expect(result.endReason).toContain('12 steps');
    });

    it('ends in budget after the same tool fails 3 times with the same arguments', async () => {
        const failing: ReasonerAction = { kind: 'tool', tool: 'diag.always_fails', args: {} };
        const model = new ScriptedModel([failing, failing, failing, failing]);
        const result = await runReasonerLoop({ model, tools: registryWithStubTools(), goal: 'try the broken tool' });
        expect(result.endState).toBe('budget');
        expect(result.endReason).toContain('failed 3 times with the same arguments');
        expect(result.steps).toHaveLength(3);
    });

    it('ends in budget when the same succeeding call repeats without progress (stuck)', async () => {
        const repeated = execAction('print("same")');
        const model = new ScriptedModel([repeated, repeated, repeated, repeated]);
        const result = await runReasonerLoop({ model, tools: registryWithStubTools(), goal: 'stuck loop' });
        expect(result.endState).toBe('budget');
        expect(result.endReason).toContain('without progress');
        expect(result.steps).toHaveLength(3);
    });

    it('ends in needs_tech when the model asks for the tech', async () => {
        const model = new ScriptedModel([{ kind: 'needs_tech', reason: 'need the freeze frame photo' }]);
        const result = await runReasonerLoop({ model, tools: registryWithStubTools(), goal: 'diagnose' });
        expect(result.endState).toBe('needs_tech');
        expect(result.endReason).toBe('need the freeze frame photo');
    });

    it('ends in safety_stop when the model reports a hazard', async () => {
        const model = new ScriptedModel([{ kind: 'safety_stop', reason: 'fuel leak visible in the frame' }]);
        const result = await runReasonerLoop({ model, tools: registryWithStubTools(), goal: 'diagnose' });
        expect(result.endState).toBe('safety_stop');
        expect(result.endReason).toBe('fuel leak visible in the frame');
    });

    it('records a bad tool call as data and keeps going', async () => {
        const model = new ScriptedModel([
            { kind: 'tool', tool: 'diag.no_such_tool', args: {} },
            { kind: 'tool', tool: 'diag.exec_python', args: { script: 42 } },
            { kind: 'finish', summary: 'recovered', citations: [] },
        ]);
        const result = await runReasonerLoop({ model, tools: registryWithStubTools(), goal: 'recover from bad calls' });
        expect(result.endState).toBe('finished');
        expect(result.steps).toHaveLength(2);
        expect(result.steps[0]?.toolResult?.ok).toBe(false);
        expect(result.steps[1]?.toolResult?.ok).toBe(false);
    });

    it('ends in a named state on every fixture', async () => {
        const fixtures: Array<{ model: ReasonerModel; goal: string }> = [
            { model: new ScriptedModel([execAction('x'), { kind: 'finish', summary: 's', citations: [] }]), goal: 'a' },
            { model: new ScriptedModel([{ kind: 'needs_tech', reason: 'r' }]), goal: 'b' },
            { model: new ScriptedModel([{ kind: 'safety_stop', reason: 'r' }]), goal: 'c' },
            {
                model: new ScriptedModel([
                    { kind: 'tool', tool: 'diag.always_fails', args: {} },
                    { kind: 'tool', tool: 'diag.always_fails', args: {} },
                    { kind: 'tool', tool: 'diag.always_fails', args: {} },
                ]),
                goal: 'd',
            },
            {
                model: {
                    nextAction: async ({ step }) => execAction(`print(${step})`),
                },
                goal: 'e',
            },
        ];
        const named: ReasonerEndState[] = ['finished', 'needs_tech', 'safety_stop', 'budget', 'max_steps'];
        const seen = new Set<ReasonerEndState>();
        for (const fixture of fixtures) {
            const result = await runReasonerLoop({ ...fixture, tools: registryWithStubTools() });
            expect(named).toContain(result.endState);
            seen.add(result.endState);
        }
        expect([...seen].sort()).toEqual(['budget', 'finished', 'max_steps', 'needs_tech', 'safety_stop']);
    });

    it('rejects an empty goal', async () => {
        const model = new ScriptedModel([]);
        await expect(
            runReasonerLoop({ model, tools: registryWithStubTools(), goal: '   ' }),
        ).rejects.toThrow('goal must not be empty');
    });
});
