export interface TraceOptions<T> {
    name: string;
    inputs: Record<string, unknown>;
    exec: () => Promise<T>;
    parentTraceId?: string;
    runType?: 'llm' | 'chain' | 'tool' | 'retriever';
    tags?: string[];
}

export interface ITracingService {
    traceAiCall<T>(options: TraceOptions<T>): Promise<T>;
}
