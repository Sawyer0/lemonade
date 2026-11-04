import {
    LiveChannelTopic,
    encodeLiveMessage,
    type AiResponseMessage,
    type VisualBurstRequestMessage,
} from '@lemonade/core';

/** The slice of a LiveKit local participant used to publish data packets. */
export interface DataPublisher {
    publishData(data: Uint8Array, options: { reliable?: boolean; topic?: string }): Promise<void>;
}

/** Typed sends from the agent to the mobile client over the room's data channel. */
export class RoomPublisher {
    constructor(private readonly participant: () => DataPublisher | undefined) {}

    aiResponse(message: AiResponseMessage): Promise<void> {
        return this.send(LiveChannelTopic.AiResponse, message);
    }

    transcript(text: string): Promise<void> {
        return this.aiResponse({ type: 'chat', analysis: { diagnosis: text } });
    }

    requestVisualBurst(component: string, reason: string): Promise<void> {
        const message: VisualBurstRequestMessage = { type: LiveChannelTopic.VisualBurstRequest, component, reason };
        return this.send(LiveChannelTopic.VisualBurstRequest, message);
    }

    private async send(topic: LiveChannelTopic, message: unknown): Promise<void> {
        await this.participant()?.publishData(encodeLiveMessage(message), { reliable: true, topic });
    }
}
