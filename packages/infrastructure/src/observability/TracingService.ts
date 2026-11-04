import { injectable, inject } from 'inversify';
import { Client } from 'langsmith';
import { v4 as uuidv4 } from 'uuid';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import { RequestContext } from '../context/request-context';
import { TYPES } from '../di/types';
import { ITracingService, TraceOptions } from '@lemonade/core';

@injectable()
export class TracingService implements ITracingService {
    constructor(@inject(TYPES.ConfigProvider) private config: IConfigProvider) {}

    async traceAiCall<T>({ name, inputs, exec, parentTraceId, runType, tags }: TraceOptions<T>): Promise<T> {
        const langSmithConfig = this.config.getLangSmithConfig();

        if (!langSmithConfig.enabled) {
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
                inputs: { ...inputs, traceId },
                run_type: runType || 'llm',
                project_name: langSmithConfig.project,
                parent_run_id: parentTraceId,
                extra: { traceId, tags },
            });
        } catch (traceErr: unknown) {
            console.warn('Failed to create LangSmith run, proceeding without tracing:', traceErr);
            return exec();
        }

        try {
            const output = await exec();
            try {
                await client!.updateRun(runId!, {
                    outputs: output as Record<string, unknown>,
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
}
