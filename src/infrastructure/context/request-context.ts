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

    run: <T>(store: RequestContextStore, callback: () => T): T => {
        return contextStorage.run(store, callback);
    },

    getTraceId: (): string => {
        const store = contextStorage.getStore();
        return store?.traceId || 'unknown-trace';
    }
};
