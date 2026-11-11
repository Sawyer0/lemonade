import { TERMINAL_JOB_EVENT_KINDS, type DiagnosticJobEvent } from '@lemonade/core';
import type { DiagnosticJobStore } from './DiagnosticJobStore';

/**
 * SSE stream for one job (LM-14). Stored events replay first, so a fresh
 * subscribe after a reconnect re-delivers anything missed; live events
 * follow. The stream closes after the terminal event.
 */
export function createJobEventStream(store: DiagnosticJobStore, jobId: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const encode = (event: DiagnosticJobEvent): Uint8Array => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    let unsubscribe: (() => void) | undefined;
    return new ReadableStream<Uint8Array>({
        start(controller) {
            const stored = store.eventsFor(jobId);
            for (const event of stored) controller.enqueue(encode(event));
            const last = stored[stored.length - 1];
            if (last && TERMINAL_JOB_EVENT_KINDS.has(last.kind)) {
                controller.close();
                return;
            }
            unsubscribe = store.subscribe(jobId, (event) => {
                try {
                    controller.enqueue(encode(event));
                } catch {
                    // The client went away mid-send; cancel() cleans up below.
                    return;
                }
                if (TERMINAL_JOB_EVENT_KINDS.has(event.kind)) {
                    unsubscribe?.();
                    unsubscribe = undefined;
                    try {
                        controller.close();
                    } catch {
                        // Already closed by a racing cancel.
                    }
                }
            });
        },
        cancel() {
            unsubscribe?.();
            unsubscribe = undefined;
        },
    });
}
