import { canonicalJson } from '../types/case';
import type {
    ReasonerLoopResult,
    ReasonerStepRecord,
    RunReasonerLoopInput,
} from './types';

const DEFAULT_MAX_STEPS = 12;
const DEFAULT_MAX_REPEATED_FAILURES = 3;
const DEFAULT_MAX_REPEATED_ACTIONS = 3;

/**
 * The bounded tool loop (LM-16): a model-driven loop inside `investigating`
 * that runs tools instead of one-shot JSON calls. Guards, in order:
 *
 * - 12-step cap (configurable) ends the loop in `max_steps`.
 * - The same tool failing 3 times with the same arguments ends it in
 *   `budget` (OpenClaw repeated-error guard).
 * - The same tool called 3 times with the same arguments, success or
 *   failure, ends it in `budget` (OpenHands stuck detector): the loop is
 *   not learning anything new.
 * - The model ends it in `finished` (with a summary and citations),
 *   `needs_tech` (it needs the tech), or `safety_stop` (it found a hazard).
 *
 * A tool failure is data, not a crash: the registry returns it and the
 * model sees it in the transcript. A model that throws aborts the loop
 * with the error, because a model failure is not a diagnosis outcome.
 */
export async function runReasonerLoop(input: RunReasonerLoopInput): Promise<ReasonerLoopResult> {
    const { model, tools, toolContext } = input;
    if (!input.goal.trim()) {
        throw new Error('reasoner goal must not be empty');
    }
    const maxSteps = input.config?.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxRepeatedFailures = input.config?.maxRepeatedFailures ?? DEFAULT_MAX_REPEATED_FAILURES;
    const maxRepeatedActions = input.config?.maxRepeatedActions ?? DEFAULT_MAX_REPEATED_ACTIONS;

    const steps: ReasonerStepRecord[] = [];
    const failureCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();
    const toolList = tools.describeForModel();

    for (let step = 1; step <= maxSteps; step += 1) {
        const action = await model.nextAction({
            goal: input.goal,
            tools: toolList,
            transcript: steps,
            step,
            maxSteps,
        });

        if (action.kind === 'finish') {
            return {
                endState: 'finished',
                endReason: 'model finished with a conclusion',
                steps,
                finishSummary: action.summary,
                citations: action.citations,
            };
        }
        if (action.kind === 'needs_tech') {
            return { endState: 'needs_tech', endReason: action.reason, steps, citations: [] };
        }
        if (action.kind === 'safety_stop') {
            return { endState: 'safety_stop', endReason: action.reason, steps, citations: [] };
        }

        const actionKey = `${action.tool}:${canonicalJson(action.args)}`;
        const repeats = (actionCounts.get(actionKey) ?? 0) + 1;
        actionCounts.set(actionKey, repeats);
        const toolResult = await tools.call(action.tool, action.args, toolContext);
        steps.push({ step, action, toolResult });

        if (!toolResult.ok) {
            const failures = (failureCounts.get(actionKey) ?? 0) + 1;
            failureCounts.set(actionKey, failures);
            if (failures >= maxRepeatedFailures) {
                return {
                    endState: 'budget',
                    endReason: `tool ${action.tool} failed ${failures} times with the same arguments`,
                    steps,
                    citations: [],
                };
            }
        }
        if (repeats >= maxRepeatedActions) {
            return {
                endState: 'budget',
                endReason: `tool ${action.tool} called ${repeats} times with the same arguments without progress`,
                steps,
                citations: [],
            };
        }
    }

    return {
        endState: 'max_steps',
        endReason: `step cap reached (${maxSteps} steps)`,
        steps,
        citations: [],
    };
}
