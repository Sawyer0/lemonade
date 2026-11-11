import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { LiveChannelTopic, MAX_FRAME_STREAM_BYTES } from '@lemonade/core';
import { FrameStreamHandler, type ByteStreamReader, type ByteStreamRoom } from '../src/channel/frameStreamHandler';
import { detection, fakeLogger, fakeResponder, session } from './fakes';

function attributes(overrides: Record<string, string> = {}) {
    return {
        sessionId: 'session-1',
        frameId: 'frame-1',
        reason: 'Agent Request (Visual Burst)',
        component: 'brakes',
        source: 'phone',
        resolution: 'low',
        still: 'false',
        capturedAt: '1790000000000',
        ...overrides,
    };
}

function reader(chunks: Array<Uint8Array>, attrs: Record<string, string>, totalSize?: number): ByteStreamReader {
    return {
        info: {
            topic: LiveChannelTopic.VisualFrameStream,
            mimeType: 'image/jpeg',
            timestamp: 1,
            totalSize,
            attributes: attrs,
        },
        readAll: vi.fn(async () => chunks),
    };
}

function setup(options: { caseId?: string } = {}) {
    const bursts = { analyze: vi.fn().mockResolvedValue(undefined) };
    const responder = fakeResponder();
    const jobs = { submitJob: vi.fn(async () => ({ jobId: 'job-1' })), trackJob: vi.fn() };
    const logger = fakeLogger();
    const store = { storeStill: vi.fn(async () => 'gs://bucket/cases/case-1/frames/frame-1.jpg') };
    const appendEntry = vi.fn(async () => ({}));
    const repository = () => ({ appendEntry }) as never;
    const testSession = { ...session, caseId: options.caseId };
    const handler = new FrameStreamHandler(testSession, bursts, responder, jobs, { store, repository }, logger);

    let registered:
        { topic: string; handler: (reader: ByteStreamReader, participant: { identity: string }) => void } | undefined;
    const room: ByteStreamRoom = {
        registerByteStreamHandler: (topic, streamHandler) => {
            registered = { topic, handler: streamHandler };
        },
    };
    handler.register(room);
    if (!registered) throw new Error('handler did not register');
    return {
        handler,
        bursts,
        responder,
        jobs,
        logger,
        store,
        appendEntry,
        deliver: registered.handler,
        topic: registered.topic,
    };
}

describe('FrameStreamHandler', () => {
    it('registers on the frame stream topic', () => {
        const { topic } = setup();
        expect(topic).toBe('visual_frame_stream');
    });

    it('hands a low-resolution talker frame to the analyzer as a base64 burst', async () => {
        const { bursts, deliver } = setup();
        const jpeg = new TextEncoder().encode('fake-jpeg-bytes');
        deliver(reader([jpeg], attributes()), { identity: 'user-1' });

        await vi.waitFor(() => expect(bursts.analyze).toHaveBeenCalled());
        const burst = bursts.analyze.mock.calls[0][0];
        expect(burst.frames).toEqual([Buffer.from(jpeg).toString('base64')]);
        expect(burst.component).toBe('brakes');
        expect(burst.metadata).toMatchObject({ reason: 'Agent Request (Visual Burst)', sessionId: 'session-1' });
        expect(burst.metadata.still).toBeUndefined();
    });

    it('passes the job port to the analyzer so complex frames file a job ticket', async () => {
        const { bursts, jobs, deliver } = setup();
        const jpeg = new TextEncoder().encode('fake-jpeg-bytes');
        deliver(reader([jpeg], attributes()), { identity: 'user-1' });

        await vi.waitFor(() => expect(bursts.analyze).toHaveBeenCalled());
        expect(bursts.analyze.mock.calls[0][3]).toBe(jobs);
    });

    it('reassembles a frame split across chunks', async () => {
        const { bursts, deliver } = setup();
        deliver(reader([new Uint8Array([1, 2]), new Uint8Array([3, 4])], attributes()), { identity: 'user-1' });
        await vi.waitFor(() => expect(bursts.analyze).toHaveBeenCalled());
        expect(bursts.analyze.mock.calls[0][0].frames).toEqual([Buffer.from([1, 2, 3, 4]).toString('base64')]);
    });

    it('passes on-device triage detections through to the burst', async () => {
        const { bursts, deliver } = setup();
        const detections = JSON.stringify([detection('Brake Rotor', 'Braking')]);
        deliver(reader([new Uint8Array([1])], attributes({ detections })), { identity: 'user-1' });
        await vi.waitFor(() => expect(bursts.analyze).toHaveBeenCalled());
        expect(bursts.analyze.mock.calls[0][0].metadata.localDetections).toHaveLength(1);
    });

    it('ignores streams from anyone but the session user', async () => {
        const { bursts, deliver } = setup();
        deliver(reader([new Uint8Array([1])], attributes()), { identity: 'someone-else' });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(bursts.analyze).not.toHaveBeenCalled();
    });

    it('drops streams with a malformed header or a wrong session', async () => {
        const { bursts, logger, deliver } = setup();
        deliver(reader([new Uint8Array([1])], { sessionId: 'session-1' }), { identity: 'user-1' });
        deliver(reader([new Uint8Array([1])], attributes({ sessionId: 'other-session' })), { identity: 'user-1' });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(bursts.analyze).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('drops a stream whose declared size is over the limit without reading it', async () => {
        const { bursts, deliver } = setup();
        const stream = reader([new Uint8Array([1])], attributes(), MAX_FRAME_STREAM_BYTES + 1);
        deliver(stream, { identity: 'user-1' });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(stream.readAll).not.toHaveBeenCalled();
        expect(bursts.analyze).not.toHaveBeenCalled();
    });

    it('logs a read failure instead of throwing', async () => {
        const { bursts, logger, deliver } = setup();
        const stream = reader([new Uint8Array([1])], attributes());
        stream.readAll = vi.fn(async () => {
            throw new Error('connection reset');
        });
        deliver(stream, { identity: 'user-1' });
        await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
        expect(bursts.analyze).not.toHaveBeenCalled();
    });

    it('stores a full-resolution still and records it in the ledger as frame_captured', async () => {
        const { bursts, store, appendEntry, deliver } = setup({ caseId: 'case-1' });
        const jpeg = new TextEncoder().encode('full-res-still');
        deliver(reader([jpeg], attributes({ source: 'glasses', resolution: 'high', still: 'true' })), {
            identity: 'user-1',
        });

        await vi.waitFor(() => expect(bursts.analyze).toHaveBeenCalled());
        expect(store.storeStill).toHaveBeenCalledWith('case-1', 'frame-1', jpeg);
        expect(appendEntry).toHaveBeenCalledWith(
            'case-1',
            expect.objectContaining({
                type: 'frame_captured',
                actor: { kind: 'user', id: 'user-1' },
                source: 'glasses',
                payload: expect.objectContaining({
                    media: expect.objectContaining({
                        storageUri: 'gs://bucket/cases/case-1/frames/frame-1.jpg',
                        sha256: createHash('sha256').update(jpeg).digest('hex'),
                    }),
                    resolution: 'high',
                }),
            }),
        );
        const burst = bursts.analyze.mock.calls[0][0];
        expect(burst.metadata.still).toBe(true);
        expect(burst.metadata.stillUri).toBe('gs://bucket/cases/case-1/frames/frame-1.jpg');
    });

    it('skips the ledger when the session has no case id, but still analyzes the still', async () => {
        const { bursts, store, appendEntry, deliver } = setup();
        deliver(reader([new Uint8Array([1])], attributes({ resolution: 'high', still: 'true' })), {
            identity: 'user-1',
        });
        await vi.waitFor(() => expect(bursts.analyze).toHaveBeenCalled());
        expect(store.storeStill).not.toHaveBeenCalled();
        expect(appendEntry).not.toHaveBeenCalled();
        expect(bursts.analyze.mock.calls[0][0].metadata.stillUri).toBeUndefined();
    });

    it('drops a still that is not full resolution, so the ledger never holds one', async () => {
        const { bursts, logger, deliver } = setup({ caseId: 'case-1' });
        deliver(reader([new Uint8Array([1])], attributes({ resolution: 'low', still: 'true' })), {
            identity: 'user-1',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(bursts.analyze).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not full resolution'), expect.anything());
    });

    it('drops a talker frame that is not low resolution', async () => {
        const { bursts, deliver } = setup();
        deliver(reader([new Uint8Array([1])], attributes({ resolution: 'high', still: 'false' })), {
            identity: 'user-1',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(bursts.analyze).not.toHaveBeenCalled();
    });

    it('logs an analyzer failure instead of throwing', async () => {
        const { bursts, logger, deliver } = setup();
        bursts.analyze.mockRejectedValueOnce(new Error('vertex down'));
        deliver(reader([new Uint8Array([1])], attributes()), { identity: 'user-1' });
        await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    });
});
