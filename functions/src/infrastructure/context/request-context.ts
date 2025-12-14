import { AsyncLocalStorage } from 'async_hooks';

/**
 * RequestContextStore holds the context for the current request.
 * Currently, it tracks the Distributed Trace ID.
 */
export interface RequestContextStore {
    traceId: string;
}

const contextStorage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
    /**
     * Runs a callback within a request context.
     */
    run: <T>(store: RequestContextStore, callback: () => T): T => {
        return contextStorage.run(store, callback);
    },

    /**
     * Gets the current trace ID.
     * Returns 'unknown-trace' if called outside a request context.
     */
    getTraceId: (): string => {
        const store = contextStorage.getStore();
        return store?.traceId || 'unknown-trace';
    }
};
