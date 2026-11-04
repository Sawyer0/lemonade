import { describe, it, expect } from 'vitest';
import {
    AiResponseMessageSchema,
    VisualBurstMessageSchema,
    UserMessageSchema,
    decodeLiveMessage,
    encodeLiveMessage,
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
});
