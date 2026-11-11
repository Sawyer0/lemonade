import { z } from 'zod';
import { SemanticTriageResultSchema } from './localPerception';

/**
 * Data-channel contract between the mobile client and the LiveKit Master Tech
 * agent. Both sides import these topics and schemas so a payload change is a
 * compile error on both ends instead of a silent runtime drop.
 */
export const LiveChannelTopic = {
    /** Agent -> client: spoken or written analysis, or a tool call to run on device. */
    AiResponse: 'ai_response',
    /** Client -> agent: result of a tool call the agent asked the device to run. */
    ToolResponse: 'tool_response',
    /** Agent -> client: ask the device for fresh high-resolution frames. */
    VisualBurstRequest: 'capture_visual_burst',
    /** Client -> agent: one frame as a LiveKit byte stream (see FrameStreamAttributes). */
    VisualFrameStream: 'visual_frame_stream',
    /** Client -> agent: on-device triage spotted something worth escalating. */
    ProactivePing: 'proactive_ping',
    /** Client -> agent: a typed message from the user during a live session. */
    UserMessage: 'user_message',
} as const;

export type LiveChannelTopic = (typeof LiveChannelTopic)[keyof typeof LiveChannelTopic];

export const LiveToolCallSchema = z.object({
    id: z.string(),
    name: z.string(),
    args: z.record(z.unknown()),
});

export const AiResponseMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.enum(['audio', 'vision', 'chat']),
        analysis: z.object({ diagnosis: z.string() }).optional(),
    }),
    z.object({ type: z.literal('tool_call'), toolCall: LiveToolCallSchema }),
    z.object({ type: z.literal('barge-in') }),
]);
export type AiResponseMessage = z.infer<typeof AiResponseMessageSchema>;

export const ToolResponseMessageSchema = z.object({
    toolCallId: z.string(),
    response: z.unknown(),
});
export type ToolResponseMessage = z.infer<typeof ToolResponseMessageSchema>;

export const VisualBurstRequestMessageSchema = z.object({
    type: z.literal(LiveChannelTopic.VisualBurstRequest),
    component: z.string(),
    reason: z.string(),
});
export type VisualBurstRequestMessage = z.infer<typeof VisualBurstRequestMessageSchema>;

export const VisualBurstMessageSchema = z.object({
    /** Base64-encoded JPEG frames, best frame first. */
    frames: z.array(z.string()).min(1),
    component: z.string().optional(),
    metadata: z.object({
        reason: z.string(),
        sessionId: z.string(),
        timestamp: z.number(),
        localDetections: z.array(SemanticTriageResultSchema).optional(),
        /**
         * A full-resolution still for the reasoner and the case ledger, never
         * the talker. Stills take the reasoning branch in BurstAnalyzer.
         */
        still: z.boolean().optional(),
        /** Ledger storage URI of the still, when it was recorded. */
        stillUri: z.string().optional(),
    }),
});
export type VisualBurstMessage = z.infer<typeof VisualBurstMessageSchema>;

/**
 * A LiveKit reliable data packet carries at most 15 KiB. Frames are larger
 * than that once base64-encoded, so they travel as byte streams (see
 * VisualFrameStream) and data packets stay small control messages.
 */
export const MAX_DATA_PACKET_BYTES = 15 * 1024;

/** True when the payload fits in one reliable data packet. */
export function isWithinDataPacketLimit(byteLength: number): boolean {
    return byteLength <= MAX_DATA_PACKET_BYTES;
}

/** Byte-stream writes are chunked at this size, under the packet limit. */
export const FRAME_STREAM_CHUNK_BYTES = 8 * 1024;

/** A frame stream larger than this is dropped, never reassembled. */
export const MAX_FRAME_STREAM_BYTES = 10 * 1024 * 1024;

export const FrameResolutionSchema = z.enum(['low', 'medium', 'high']);
export type FrameResolution = z.infer<typeof FrameResolutionSchema>;

/** Frames the talker sees are low resolution (Gemini MEDIA_RESOLUTION_LOW, 64 tokens). */
export const TALKER_FRAME_RESOLUTION: FrameResolution = 'low';

/**
 * Header attributes on a visual frame byte stream. LiveKit stream attributes
 * are string-to-string, so every field is a string on the wire, including the
 * epoch-millisecond capture time and the still flag.
 */
export const FrameStreamAttributesSchema = z.object({
    sessionId: z.string().min(1),
    frameId: z.string().min(1),
    reason: z.string().min(1),
    component: z.string().min(1).optional(),
    source: z.enum(['glasses', 'phone']),
    /** Talker frames are low; a high-resolution frame must be a still. */
    resolution: z.enum(['low', 'high']),
    still: z.enum(['true', 'false']),
    /** Epoch milliseconds, as a decimal string. */
    capturedAt: z.string().regex(/^\d+$/, 'capturedAt must be epoch milliseconds as a decimal string'),
    /**
     * On-device triage detections for the frame, JSON-encoded (the agent
     * routes complex systems to full reasoning from these). Absent when the
     * frame has no detections.
     */
    detections: z.string().optional(),
});
export type FrameStreamAttributes = z.infer<typeof FrameStreamAttributesSchema>;

/** Validates stream attributes for sending; throws on a malformed header. */
export function encodeFrameStreamAttributes(attributes: FrameStreamAttributes): Record<string, string> {
    return FrameStreamAttributesSchema.parse(attributes);
}

/** Parses and validates a received stream header. Returns null when malformed, so a bad stream is dropped, not thrown. */
export function decodeFrameStreamAttributes(
    attributes: Record<string, string> | undefined,
): FrameStreamAttributes | null {
    if (!attributes) return null;
    const parsed = FrameStreamAttributesSchema.safeParse(attributes);
    return parsed.success ? parsed.data : null;
}

export const ProactivePingMessageSchema = z.object({
    type: z.literal('PROACTIVE_PING'),
    detection: SemanticTriageResultSchema,
    sessionId: z.string(),
    timestamp: z.number(),
});
export type ProactivePingMessage = z.infer<typeof ProactivePingMessageSchema>;

export const UserMessageSchema = z.object({
    text: z.string().min(1),
    sessionId: z.string(),
    timestamp: z.number(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Serialises a channel message to the bytes LiveKit publishes. */
export function encodeLiveMessage<T>(message: T): Uint8Array {
    return encoder.encode(JSON.stringify(message));
}

/**
 * Parses and validates a channel payload. Returns null for malformed JSON or a
 * payload that does not match the schema, so a bad packet is dropped, not thrown.
 */
export function decodeLiveMessage<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, payload: Uint8Array): T | null {
    let raw: unknown;
    try {
        raw = JSON.parse(decoder.decode(payload));
    } catch {
        return null;
    }
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}
