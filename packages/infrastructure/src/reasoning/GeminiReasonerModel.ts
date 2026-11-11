import { FunctionDeclaration, GenerativeModel, SchemaType, Tool } from '@google-cloud/vertexai';
import { z } from 'zod';
import type { ReasonerAction, ReasonerModel, ReasonerModelInput } from '@lemonade/core';

// --- Wire names ---
// Vertex function names cannot carry the registry's dots, so the model
// calls the underscore form and this adapter maps it back to the
// namespaced registry name. Control calls (finish / needs_tech /
// safety_stop) are model-facing only: they end the loop, they are not
// registry tools.
const WIRE_TO_REGISTRY: Record<string, string> = {
    diag_exec_python: 'diag.exec_python',
    diag_list_workdir: 'diag.list_workdir',
    diag_read_file: 'diag.read_file',
};

const FinishArgsSchema = z.object({ summary: z.string().min(1), citations: z.array(z.string()).default([]) });
const NeedsTechArgsSchema = z.object({ reason: z.string().min(1) });
const SafetyStopArgsSchema = z.object({ reason: z.string().min(1) });

function declaration(
    name: string,
    description: string,
    properties: Record<string, object>,
    required: string[],
): FunctionDeclaration {
    return {
        name,
        description,
        parameters: { type: SchemaType.OBJECT, properties, required },
    };
}

const STRING = (description: string) => ({ type: SchemaType.STRING, description });

export const REASONER_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
    declaration(
        'diag_exec_python',
        'Run a Python script in the case sandbox. diaglib is importable, the case files are in /work, there is no network. Returns the script output.',
        { script: STRING('Python source to run in the sandbox.') },
        ['script'],
    ),
    declaration(
        'diag_list_workdir',
        'List the files staged in the case workdir (freeze frame, PID log, stills, script outputs).',
        {},
        [],
    ),
    declaration(
        'diag_read_file',
        'Read a file from the case workdir, capped at 2k chars.',
        { name: STRING('Workdir-relative file name, e.g. output-step-1.txt.') },
        ['name'],
    ),
    declaration(
        'reasoner_finish',
        'End the loop with a conclusion. Cite the sandbox outputs the conclusion rests on.',
        {
            summary: STRING('What the computation established.'),
            citations: { type: SchemaType.ARRAY, items: STRING('One sandbox output the conclusion cites.') },
        },
        ['summary'],
    ),
    declaration(
        'reasoner_needs_tech',
        'End the loop: the computation cannot proceed without the tech.',
        { reason: STRING('What is needed from the tech.') },
        ['reason'],
    ),
    declaration(
        'reasoner_safety_stop',
        'End the loop: the data shows a hazard.',
        { reason: STRING('What the hazard is.') },
        ['reason'],
    ),
];

/** The narrow surface GeminiReasonerModel needs from a generative model. */
export interface ReasonerGenerativeModel {
    generateContent(request: { contents: Array<{ role: string; parts: Array<{ text: string }> }> }): Promise<{
        functionCall?: { name: string; args: Record<string, unknown> };
        text?: string;
    }>;
}

/** Adapts a Vertex GenerativeModel to the narrow surface above. */
export function createVertexReasonerModel(model: GenerativeModel): ReasonerGenerativeModel {
    return {
        async generateContent(request) {
            const response = await model.generateContent({ contents: request.contents });
            const parts = response.response.candidates?.[0]?.content?.parts ?? [];
            const callPart = parts.find((part) => part.functionCall);
            if (callPart?.functionCall) {
                const args = (callPart.functionCall.args ?? {}) as Record<string, unknown>;
                return { functionCall: { name: callPart.functionCall.name, args } };
            }
            const text = parts.map((part) => part.text ?? '').join('');
            return { text };
        },
    };
}

const PROMPT_RESULT_LIMIT = 1_000;

/**
 * The production reasoner model (LM-16): a Gemini model bound to the
 * reasoner function declarations, driving the bounded tool loop. One
 * stateless call per loop step: the goal, the tools, and the transcript so
 * far go in, and exactly one function call (or a prose conclusion) comes
 * out. A text-only reply is a finish; a malformed control call throws, so
 * a confused model aborts the run instead of ending it with a bad state.
 */
export class GeminiReasonerModel implements ReasonerModel {
    private readonly model: ReasonerGenerativeModel;

    constructor(modelFactory: (tools: Tool[]) => ReasonerGenerativeModel) {
        this.model = modelFactory([{ functionDeclarations: REASONER_FUNCTION_DECLARATIONS }]);
    }

    async nextAction(input: ReasonerModelInput): Promise<ReasonerAction> {
        const transcript = input.transcript
            .map((step) => {
                const action = step.action;
                if (action.kind !== 'tool') {
                    return `Step ${step.step}: model action ${action.kind}`;
                }
                const result = step.toolResult;
                const outcome = result
                    ? result.ok
                        ? result.output.slice(0, PROMPT_RESULT_LIMIT)
                        : `FAILED: ${result.error}`
                    : 'no result';
                return `Step ${step.step}: called ${action.tool}(${JSON.stringify(action.args)}) -> ${outcome}`;
            })
            .join('\n');
        const toolList = input.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
        const prompt = [
            'You are the Lemonade reasoner, diagnosing a vehicle by computing over its own scan data.',
            `Goal: ${input.goal}`,
            `Step ${input.step} of ${input.maxSteps}.`,
            'Tools you may call (one function call per turn):',
            toolList,
            'Call diag_exec_python to compute: write Python against diaglib (DTC lookup, PID decoding, fuel trims, misfire counts, waveform stats) and read the case files from /work.',
            'Call reasoner_finish when the computation answers the goal, citing the sandbox outputs. Call reasoner_needs_tech when the tech must supply something first. Call reasoner_safety_stop when the data shows a hazard.',
            transcript ? `So far:\n${transcript}` : 'No steps yet.',
        ].join('\n');
        const response = await this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return parseModelResponse(response);
    }
}

function parseModelResponse(response: {
    functionCall?: { name: string; args: Record<string, unknown> };
    text?: string;
}): ReasonerAction {
    const call = response.functionCall;
    if (!call) {
        if (response.text?.trim()) {
            return { kind: 'finish', summary: response.text.trim(), citations: [] };
        }
        throw new Error('reasoner model returned neither a function call nor text');
    }
    if (call.name === 'reasoner_finish') {
        const parsed = FinishArgsSchema.safeParse(call.args);
        if (!parsed.success) {
            throw new Error(`reasoner model returned a malformed finish call: ${parsed.error.message}`);
        }
        return { kind: 'finish', summary: parsed.data.summary, citations: parsed.data.citations };
    }
    if (call.name === 'reasoner_needs_tech') {
        const parsed = NeedsTechArgsSchema.safeParse(call.args);
        if (!parsed.success) {
            throw new Error(`reasoner model returned a malformed needs_tech call: ${parsed.error.message}`);
        }
        return { kind: 'needs_tech', reason: parsed.data.reason };
    }
    if (call.name === 'reasoner_safety_stop') {
        const parsed = SafetyStopArgsSchema.safeParse(call.args);
        if (!parsed.success) {
            throw new Error(`reasoner model returned a malformed safety_stop call: ${parsed.error.message}`);
        }
        return { kind: 'safety_stop', reason: parsed.data.reason };
    }
    const registryName = WIRE_TO_REGISTRY[call.name] ?? call.name;
    return { kind: 'tool', tool: registryName, args: call.args };
}
