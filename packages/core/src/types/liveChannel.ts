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
    /** Client -> agent: frames (from the phone camera or glasses) to analyse. */
    VisualBurstResponse: 'visual_burst_response',
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
    }),
});
export type VisualBurstMessage = z.infer<typeof VisualBurstMessageSchema>;

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
