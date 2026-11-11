import {
    FRAME_STREAM_CHUNK_BYTES,
    LiveChannelTopic,
    encodeFrameStreamAttributes,
    type FrameStreamAttributes,
} from '@lemonade/core';

/**
 * Sends frames to the agent as LiveKit byte streams. A base64 frame is far
 * larger than the 15 KiB reliable data packet limit, so frames never go by
 * publishData; the stream chunks them under the limit instead. Small control
 * messages (tool results, pings, typed messages) stay on data packets.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Map<string, number>([...BASE64_ALPHABET].map((char, index) => [char, index]));

/** Decodes base64 to bytes without a platform atob. Throws on invalid input. */
export function base64ToBytes(base64: string): Uint8Array {
    const cleaned = base64.replace(/\s/g, '');
    if (cleaned.length % 4 !== 0) throw new Error('Invalid base64: length must be a multiple of 4');
    const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
    const bytes = new Uint8Array((cleaned.length / 4) * 3 - padding);
    let offset = 0;
    for (let group = 0; group < cleaned.length; group += 4) {
        const values = [0, 1, 2, 3].map((position) => {
            const char = cleaned[group + position];
            if (char === '=') return 0;
            const value = BASE64_LOOKUP.get(char);
            if (value === undefined) throw new Error(`Invalid base64: unexpected character '${char}'`);
            return value;
        });
        const triple = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
        bytes[offset++] = (triple >> 16) & 0xff;
        if (cleaned[group + 2] !== '=') bytes[offset++] = (triple >> 8) & 0xff;
        if (cleaned[group + 3] !== '=') bytes[offset++] = triple & 0xff;
    }
    return bytes;
}

/** The slice of a LiveKit local participant the sender needs. */
export interface ByteStreamPublisher {
    streamBytes(options: {
        topic?: string;
        mimeType?: string;
        totalSize?: number;
        attributes?: Record<string, string>;
    }): Promise<ByteStreamWriter>;
}

export interface ByteStreamWriter {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
}

/** Streams one frame as a byte stream, chunked under the packet limit. */
export class FrameStreamSender {
    constructor(private readonly publisher: () => ByteStreamPublisher | undefined) {}

    async sendFrame(bytes: Uint8Array, attributes: FrameStreamAttributes): Promise<{ bytesSent: number }> {
        if (bytes.byteLength === 0) throw new Error('Cannot stream an empty frame');
        const publisher = this.publisher();
        if (!publisher) throw new Error('No live room to stream the frame to');
        const writer = await publisher.streamBytes({
            topic: LiveChannelTopic.VisualFrameStream,
            mimeType: 'image/jpeg',
            totalSize: bytes.byteLength,
            attributes: encodeFrameStreamAttributes(attributes),
        });
        try {
            for (let offset = 0; offset < bytes.byteLength; offset += FRAME_STREAM_CHUNK_BYTES) {
                await writer.write(bytes.subarray(offset, Math.min(offset + FRAME_STREAM_CHUNK_BYTES, bytes.byteLength)));
            }
            await writer.close();
        } catch (error) {
            try {
                await writer.close();
            } catch {
                // Already failing; the close error adds nothing.
            }
            throw error;
        }
        return { bytesSent: bytes.byteLength };
    }
}
