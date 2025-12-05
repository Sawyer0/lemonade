import { Client } from 'langsmith';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '@/infrastructure/config';

interface TraceOptions<T> {
    name: string;
    inputs: Record<string, unknown>;
    exec: () => Promise<T>;
}

/**
 * LangSmith tracing hook.
 *
 * Wraps AI adapter calls with LangSmith distributed tracing.
 */
export async function traceAiCall<T>({ name, inputs, exec }: TraceOptions<T>): Promise<T> {
    if (!CONFIG.OBSERVABILITY.LANGSMITH_ENABLED) {
        return exec();
    }

    let client: Client;
    let runId: string;

    try {
        client = new Client();
        runId = uuidv4();
        await client.createRun({
            id: runId,
            name,
            inputs,
            run_type: "llm",
            project_name: CONFIG.OBSERVABILITY.LANGSMITH_PROJECT,
        });
    } catch (traceErr) {
        console.warn('Failed to create LangSmith run, proceeding without tracing:', traceErr);
        return exec();
    }

    try {
        const output = await exec();
        // We assume T is an object compatible with the outputs map, or we wrap it.
        // In our current usage (Gemini adapters), T is GenerateContentResult which is an object.
        try {
            await client.updateRun(runId, {
                outputs: output as Record<string, unknown>
            });
        } catch (traceErr) {
            console.warn('Failed to update LangSmith run (outputs), proceeding:', traceErr);
        }
        return output;
    } catch (err) {
        try {
            await client.updateRun(runId, {
                error: err instanceof Error ? err.message : String(err),
            });
        } catch (traceErr) {
            console.warn('Failed to update LangSmith run (error), proceeding:', traceErr);
        }
        throw err;
    }
}
