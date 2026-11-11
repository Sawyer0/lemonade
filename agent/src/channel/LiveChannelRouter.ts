import {
    LiveChannelTopic,
    ProactivePingMessageSchema,
    ToolResponseMessageSchema,
    UserMessageSchema,
    VisualBurstMessageSchema,
    decodeLiveMessage,
    type ILogger,
} from '@lemonade/core';
import type { BurstAnalyzer, BurstResponder, DiagnosticJobSubmission } from '../diagnosis/BurstAnalyzer';
import type { SessionContext } from '../diagnosis/sessionContext';

/** The voice conversation, as the router needs it. Implemented over the LiveKit AgentSession. */
export interface Conversation {
    /**
     * Speak a line to the user and mirror it to the client transcript. There
     * is no TTS in a native-audio session, so the line is delivered as reply
     * instructions and the model speaks a reply following it.
     */
    say(text: string): Promise<void>;
    /** Treat text as something the user said and let the model answer. */
    replyTo(userInput: string): void;
    /** Give the model context it should act on (e.g. a device tool result) and let it respond. */
    inform(instructions: string): void;
}

/**
 * Handles packets the mobile client publishes on the data channel (see
 * LiveChannelTopic). Packets from anyone but the session's user, and packets
 * that fail schema validation, are dropped.
 */
export class LiveChannelRouter {
    constructor(
        private readonly session: SessionContext,
        private readonly conversation: Conversation,
        private readonly bursts: Pick<BurstAnalyzer, 'analyze'>,
        private readonly responder: BurstResponder,
        private readonly logger: ILogger,
        private readonly jobs: DiagnosticJobSubmission,
    ) {}

    async handle(payload: Uint8Array, senderIdentity: string | undefined, topic: string | undefined): Promise<void> {
        if (senderIdentity !== this.session.userId) return;

        try {
            switch (topic) {
                case LiveChannelTopic.UserMessage:
                    return this.onUserMessage(payload);
                case LiveChannelTopic.ProactivePing:
                    return await this.onProactivePing(payload);
                case LiveChannelTopic.VisualBurstResponse:
                    return await this.onVisualBurst(payload);
                case LiveChannelTopic.ToolResponse:
                    return this.onToolResponse(payload);
                default:
                    return;
            }
        } catch (error) {
            this.logger.error('Failed to handle data channel packet', error as Error, { topic });
        }
    }

    private onUserMessage(payload: Uint8Array): void {
        const message = decodeLiveMessage(UserMessageSchema, payload);
        if (message) this.conversation.replyTo(message.text);
        else this.drop(LiveChannelTopic.UserMessage);
    }

    private async onProactivePing(payload: Uint8Array): Promise<void> {
        const ping = decodeLiveMessage(ProactivePingMessageSchema, payload);
        if (!ping) return this.drop(LiveChannelTopic.ProactivePing);

        this.logger.info('Proactive ping', { part: ping.detection.id.obj, risk: ping.detection.eval.risk });
        if (ping.detection.eval.risk) {
            await this.conversation.say(
                `I'm seeing something concerning with the ${ping.detection.id.obj}. Analyzing now...`,
            );
        }
    }

    private async onVisualBurst(payload: Uint8Array): Promise<void> {
        const burst = decodeLiveMessage(VisualBurstMessageSchema, payload);
        if (!burst) return this.drop(LiveChannelTopic.VisualBurstResponse);

        this.logger.info('Analyzing visual burst', { frames: burst.frames.length, reason: burst.metadata.reason });
        await this.bursts.analyze(burst, this.session, this.responder, this.jobs);
    }

    private onToolResponse(payload: Uint8Array): void {
        const result = decodeLiveMessage(ToolResponseMessageSchema, payload);
        if (!result) return this.drop(LiveChannelTopic.ToolResponse);
        this.conversation.inform(
            `The device finished tool call ${result.toolCallId} with result ${JSON.stringify(result.response)}. ` +
                'Continue the diagnosis with this in mind.',
        );
    }

    private drop(topic: string): void {
        this.logger.warn('Dropped malformed data channel packet', { topic });
    }
}
