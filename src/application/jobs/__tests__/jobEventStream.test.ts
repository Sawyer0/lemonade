import { describe, expect, it } from 'vitest';
import { DiagnosticJobStore } from '../DiagnosticJobStore';
import { createJobEventStream } from '../jobEventStream';

async function readAll(stream: ReadableStream<Uint8Array>, timeoutMs = 2_000): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const timeout = new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('stream did not close in time')), timeoutMs),
    );
    const reading = (async () => {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return text;
    })();
    return Promise.race([reading, timeout]);
}

function eventTexts(sse: string): string[] {
    return sse
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice('data: '.length)) as { kind: string; text: string })
        .map((event) => `${event.kind}:${event.text}`);
}

describe('createJobEventStream', () => {
    it('replays stored events, then streams live ones, and closes after the terminal event', async () => {
        const store = new DiagnosticJobStore();
        const job = store.create({
            question: 'Why does it squeal?',
            evidenceRefs: [],
            sessionId: 'session-1',
            userId: 'user-1',
            vehicle: {},
        });
        store.appendEvent(job.id, { kind: 'progress', text: 'Started.' });
        const stream = createJobEventStream(store, job.id);
        const reading = readAll(stream);
        // Let the stream start before the live event lands.
        await new Promise((resolve) => setTimeout(resolve, 10));
        store.appendEvent(job.id, { kind: 'finding', text: 'Replace the sensor.' });
        const sse = await reading;
        expect(eventTexts(sse)).toEqual(['progress:Started.', 'finding:Replace the sensor.']);
    });

    it('closes immediately when the job already finished', async () => {
        const store = new DiagnosticJobStore();
        const job = store.create({
            question: 'Why does it squeal?',
            evidenceRefs: [],
            sessionId: 'session-1',
            userId: 'user-1',
            vehicle: {},
        });
        store.appendEvent(job.id, { kind: 'progress', text: 'Started.' });
        store.appendEvent(job.id, { kind: 'finding', text: 'Replace the sensor.' });
        const sse = await readAll(createJobEventStream(store, job.id));
        expect(eventTexts(sse)).toEqual(['progress:Started.', 'finding:Replace the sensor.']);
    });
});
