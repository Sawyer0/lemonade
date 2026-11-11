import { describe, it, expect, vi } from 'vitest';
import { GeminiReasonerModel } from '../GeminiReasonerModel';
import type { ReasonerGenerativeModel } from '../GeminiReasonerModel';
import type { ReasonerModelInput } from '@lemonade/core';

function modelInput(): ReasonerModelInput {
    return {
        goal: 'compute fuel trims',
        tools: [{ name: 'diag.exec_python', description: 'Run Python.', side: 'server' }],
        transcript: [],
        step: 1,
        maxSteps: 12,
    };
}

function stubModel(response: Awaited<ReturnType<ReasonerGenerativeModel['generateContent']>>): ReasonerGenerativeModel {
    return { generateContent: vi.fn().mockResolvedValue(response) };
}

describe('GeminiReasonerModel', () => {
    it('maps a diag function call to the namespaced registry tool', async () => {
        const model = new GeminiReasonerModel(() =>
            stubModel({ functionCall: { name: 'diag_exec_python', args: { script: 'print(1)' } } }),
        );
        const action = await model.nextAction(modelInput());
        expect(action).toEqual({ kind: 'tool', tool: 'diag.exec_python', args: { script: 'print(1)' } });
    });

    it('maps a finish call to a finish action with citations', async () => {
        const model = new GeminiReasonerModel(() =>
            stubModel({
                functionCall: {
                    name: 'reasoner_finish',
                    args: { summary: 'Bank 1 is lean.', citations: ['total_mean=20.0'] },
                },
            }),
        );
        const action = await model.nextAction(modelInput());
        expect(action).toEqual({ kind: 'finish', summary: 'Bank 1 is lean.', citations: ['total_mean=20.0'] });
    });

    it('maps needs_tech and safety_stop calls to their end states', async () => {
        const needsTech = new GeminiReasonerModel(() =>
            stubModel({ functionCall: { name: 'reasoner_needs_tech', args: { reason: 'need a photo' } } }),
        );
        expect(await needsTech.nextAction(modelInput())).toEqual({ kind: 'needs_tech', reason: 'need a photo' });

        const safetyStop = new GeminiReasonerModel(() =>
            stubModel({ functionCall: { name: 'reasoner_safety_stop', args: { reason: 'fuel leak' } } }),
        );
        expect(await safetyStop.nextAction(modelInput())).toEqual({ kind: 'safety_stop', reason: 'fuel leak' });
    });

    it('treats a text-only reply as a finish', async () => {
        const model = new GeminiReasonerModel(() => stubModel({ text: 'Bank 1 is lean at +20%.' }));
        const action = await model.nextAction(modelInput());
        expect(action).toEqual({ kind: 'finish', summary: 'Bank 1 is lean at +20%.', citations: [] });
    });

    it('passes an unknown function name through as a tool call, for the registry to reject', async () => {
        const model = new GeminiReasonerModel(() => stubModel({ functionCall: { name: 'diag_nope', args: {} } }));
        const action = await model.nextAction(modelInput());
        expect(action).toEqual({ kind: 'tool', tool: 'diag_nope', args: {} });
    });

    it('throws on a malformed finish call instead of ending with a bad state', async () => {
        const model = new GeminiReasonerModel(() =>
            stubModel({ functionCall: { name: 'reasoner_finish', args: { summary: '' } } }),
        );
        await expect(model.nextAction(modelInput())).rejects.toThrow('malformed finish call');
    });

    it('throws when the model returns neither a call nor text', async () => {
        const model = new GeminiReasonerModel(() => stubModel({}));
        await expect(model.nextAction(modelInput())).rejects.toThrow('neither a function call nor text');
    });
});
