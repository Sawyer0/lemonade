import { Client } from 'langsmith';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config'; // Use local config
import { RequestContext } from '../context/request-context'; // Need to migrate this too

interface TraceOptions<T> {
    name: string;
    inputs: Record<string, unknown>;
    exec: () => Promise<T>;
    parentTraceId?: string; 
}

/**
 * LangSmith tracing hook.
 *
 * Wraps AI adapter calls with LangSmith distributed tracing.
 */
export async function traceAiCall<T>({ name, inputs, exec, parentTraceId }: TraceOptions<T>): Promise<T> {
    if (!CONFIG.OBSERVABILITY.LANGSMITH_ENABLED) {
        return exec();
    }

    const traceId = RequestContext.getTraceId();
    let client: Client;
    let runId: string;

    try {
        client = new Client();
        runId = uuidv4();
        await client.createRun({
            id: runId,
            name,
            inputs: { ...inputs, traceId }, // Include traceId in LangSmith inputs
            run_type: "llm",
            project_name: CONFIG.OBSERVABILITY.LANGSMITH_PROJECT,
            parent_run_id: parentTraceId, // Link to parent trace
            extra: { traceId } // Also store as extra for easy filtering
        });
    } catch (traceErr: unknown) {
        console.warn('Failed to create LangSmith run, proceeding without tracing:', traceErr);
        // Silently fail or use logger if available. Ideally we shouldn't fail execution if tracing fails.
        return exec();
    }

    try {
        const output = await exec();
        try {
            await client!.updateRun(runId!, {
                outputs: output as Record<string, unknown>
            });
        } catch (traceErr: unknown) {
            console.warn('Failed to update LangSmith run (outputs), proceeding:', traceErr);
        }
        return output;
    } catch (err) {
        try {
            await client!.updateRun(runId!, {
                error: err instanceof Error ? err.message : String(err),
            });
        } catch (traceErr: unknown) {
            console.warn('Failed to update LangSmith run (error), proceeding:', traceErr);
        }
        throw err;
    }
}