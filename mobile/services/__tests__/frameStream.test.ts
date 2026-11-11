import { FrameStreamSender, base64ToBytes, type ByteStreamPublisher, type ByteStreamWriter } from '../frameStream';
import { MAX_DATA_PACKET_BYTES } from '@lemonade/core';

function attributes() {
    return {
        sessionId: 'session-1',
        frameId: 'frame-1',
        reason: 'Agent Request (Visual Burst)',
        source: 'glasses' as const,
        resolution: 'low' as const,
        still: 'false' as const,
        capturedAt: '1790000000000',
    };
}

function setup() {
    const chunks: Uint8Array[] = [];
    const writer: ByteStreamWriter = {
        write: jest.fn(async (chunk: Uint8Array) => {
            chunks.push(chunk);
        }),
        close: jest.fn(async () => undefined),
    };
    const streamOptions: unknown[] = [];
    const publisher: ByteStreamPublisher = {
        streamBytes: jest.fn(async (options: unknown) => {
            streamOptions.push(options);
            return writer;
        }),
    };
    return { chunks, writer, streamOptions, publisher, sender: new FrameStreamSender(() => publisher) };
}

describe('base64ToBytes', () => {
    it('decodes base64, including padding', () => {
        expect(base64ToBytes('aGVsbG8=')).toEqual(new TextEncoder().encode('hello'));
        expect(base64ToBytes('aGk=')).toEqual(new TextEncoder().encode('hi'));
        expect(base64ToBytes('')).toEqual(new Uint8Array(0));
    });

    it('throws on invalid base64', () => {
        expect(() => base64ToBytes('abc')).toThrow();
        expect(() => base64ToBytes('****')).toThrow();
    });
});

describe('FrameStreamSender', () => {
    it('streams a frame in chunks under the packet limit and closes the stream', async () => {
        const { chunks, writer, streamOptions, sender } = setup();
        const bytes = new Uint8Array(20 * 1024).fill(7);
        const result = await sender.sendFrame(bytes, attributes());

        expect(result).toEqual({ bytesSent: 20 * 1024 });
        expect(chunks).toHaveLength(3);
        expect(chunks.map((chunk) => chunk.byteLength)).toEqual([8 * 1024, 8 * 1024, 4 * 1024]);
        for (const chunk of chunks) expect(chunk.byteLength).toBeLessThanOrEqual(MAX_DATA_PACKET_BYTES);
        expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))).toEqual(Buffer.from(bytes));
        expect(writer.close).toHaveBeenCalledTimes(1);
        expect(streamOptions).toEqual([
            expect.objectContaining({
                topic: 'visual_frame_stream',
                mimeType: 'image/jpeg',
                totalSize: 20 * 1024,
                attributes: expect.objectContaining({ sessionId: 'session-1', frameId: 'frame-1' }),
            }),
        ]);
    });

    it('refuses an empty frame without opening a stream', async () => {
        const { publisher, sender } = setup();
        await expect(sender.sendFrame(new Uint8Array(0), attributes())).rejects.toThrow('empty frame');
        expect(publisher.streamBytes).not.toHaveBeenCalled();
    });

    it('throws when there is no live room', async () => {
        const sender = new FrameStreamSender(() => undefined);
        await expect(sender.sendFrame(new Uint8Array(10), attributes())).rejects.toThrow('No live room');
    });

    it('closes the stream and rethrows when a write fails', async () => {
        const { writer, sender } = setup();
        (writer.write as jest.Mock).mockRejectedValueOnce(new Error('transport down'));
        await expect(sender.sendFrame(new Uint8Array(20 * 1024), attributes())).rejects.toThrow('transport down');
        expect(writer.close).toHaveBeenCalled();
    });
});
