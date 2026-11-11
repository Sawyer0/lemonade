import { describe, it, expect } from 'vitest';
import {
    AiResponseMessageSchema,
    FRAME_STREAM_CHUNK_BYTES,
    MAX_DATA_PACKET_BYTES,
    MAX_FRAME_STREAM_BYTES,
    TALKER_FRAME_RESOLUTION,
    VisualBurstMessageSchema,
    UserMessageSchema,
    decodeFrameStreamAttributes,
    decodeLiveMessage,
    encodeFrameStreamAttributes,
    encodeLiveMessage,
    isWithinDataPacketLimit,
} from '../types/liveChannel';

describe('live channel protocol', () => {
    it('round-trips a user message', () => {
        const message = { text: 'brakes squeal', sessionId: 's1', timestamp: 1 };
        expect(decodeLiveMessage(UserMessageSchema, encodeLiveMessage(message))).toEqual(message);
    });

    it('drops malformed JSON instead of throwing', () => {
        expect(decodeLiveMessage(UserMessageSchema, new TextEncoder().encode('{nope'))).toBeNull();
    });

    it('rejects a burst with no frames', () => {
        const burst = { frames: [], metadata: { reason: 'x', sessionId: 's1', timestamp: 1 } };
        expect(decodeLiveMessage(VisualBurstMessageSchema, encodeLiveMessage(burst))).toBeNull();
    });

    it('validates local detections in a burst', () => {
        const detection = {
            id: { obj: 'Brake Rotor', cat: 'Braking' },
            eval: { stat: 'CRITICAL', risk: true, note: 'scored' },
        };
        const burst = {
            frames: ['abc'],
            metadata: { reason: 'r', sessionId: 's', timestamp: 2, localDetections: [detection] },
        };
        expect(
            decodeLiveMessage(VisualBurstMessageSchema, encodeLiveMessage(burst))?.metadata.localDetections,
        ).toHaveLength(1);
    });

    it('narrows ai responses by type', () => {
        const parsed = AiResponseMessageSchema.parse({ type: 'tool_call', toolCall: { id: '1', name: 'n', args: {} } });
        expect(parsed.type === 'tool_call' && parsed.toolCall.name).toBe('n');
        expect(AiResponseMessageSchema.safeParse({ type: 'tool_call' }).success).toBe(false);
    });

    it('caps a data packet at 15 KiB, the LiveKit limit', () => {
        expect(MAX_DATA_PACKET_BYTES).toBe(15 * 1024);
        expect(isWithinDataPacketLimit(15 * 1024)).toBe(true);
        expect(isWithinDataPacketLimit(15 * 1024 + 1)).toBe(false);
    });

    it('keeps byte-stream chunks under the packet limit', () => {
        expect(FRAME_STREAM_CHUNK_BYTES).toBeLessThanOrEqual(MAX_DATA_PACKET_BYTES);
        expect(MAX_FRAME_STREAM_BYTES).toBe(10 * 1024 * 1024);
    });

    it('sends talker frames at low resolution', () => {
        expect(TALKER_FRAME_RESOLUTION).toBe('low');
    });

    it('round-trips frame stream attributes', () => {
        const attributes = {
            sessionId: 's1',
            frameId: 'f1',
            reason: 'Agent Request (Visual Burst)',
            component: 'brakes',
            source: 'glasses' as const,
            resolution: 'low' as const,
            still: 'false' as const,
            capturedAt: '1790000000000',
            detections: JSON.stringify([
                { id: { obj: 'Brake Rotor', cat: 'Braking' }, eval: { stat: 'NORMAL', risk: false, note: 'seen' } },
            ]),
        };
        expect(decodeFrameStreamAttributes(encodeFrameStreamAttributes(attributes))).toEqual(attributes);
    });

    it('drops malformed frame stream attributes instead of throwing', () => {
        expect(decodeFrameStreamAttributes(undefined)).toBeNull();
        expect(decodeFrameStreamAttributes({ sessionId: 's1' })).toBeNull();
        expect(
            decodeFrameStreamAttributes({
                sessionId: 's1',
                frameId: 'f1',
                reason: 'r',
                source: 'glasses',
                resolution: 'medium',
                still: 'false',
                capturedAt: '1',
            }),
        ).toBeNull();
    });

    it('marks a still burst for the reasoner, never the talker', () => {
        const burst = {
            frames: ['abc'],
            component: 'brakes',
            metadata: { reason: 'r', sessionId: 's', timestamp: 2, still: true, stillUri: 'gs://bucket/frame.jpg' },
        };
        expect(decodeLiveMessage(VisualBurstMessageSchema, encodeLiveMessage(burst))?.metadata.still).toBe(true);
    });
});
