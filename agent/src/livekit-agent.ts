import { type JobContext, defineAgent, voice } from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { RoomEvent, type RemoteParticipant } from '@livekit/rtc-node';
import type { ILiveStreamAnalyzer, IMechanicReasoningService } from '@lemonade/core';
import { Logger, TYPES, createContainer } from '@lemonade/infrastructure';
import { loadEnv } from './env';
import { LiveChannelRouter, type Conversation } from './channel/LiveChannelRouter';
import { RoomPublisher } from './channel/roomPublisher';
import { BurstAnalyzer } from './diagnosis/BurstAnalyzer';
import { describeVehicle, parseSessionContext } from './diagnosis/sessionContext';
import { masterTechInstructions } from './voice/instructions';
import { createMasterTechTools } from './voice/tools';
import { createVoice } from './voice/voice';
import { livekitVoiceProviders } from './voice/livekitVoiceProviders';

const env = loadEnv();
const logger = new Logger();

// Frame analysis needs the media model (Vertex by default), Firestore and NHTSA. Build that
// graph on the first frame, so a voice-only call (and the live e2e test) needs only LiveKit and Gemini.
let burstAnalyzer: BurstAnalyzer | undefined;
const bursts: Pick<BurstAnalyzer, 'analyze'> = {
    analyze: (...args) => {
        if (!burstAnalyzer) {
            const container = createContainer();
            burstAnalyzer = new BurstAnalyzer(
                container.get<IMechanicReasoningService>(TYPES.MechanicReasoningService),
                container.get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI),
            );
        }
        return burstAnalyzer.analyze(...args);
    },
};

/** Adapts the LiveKit AgentSession to the router's Conversation port. */
function conversationFor(session: voice.AgentSession): Conversation {
    return {
        // Native-audio sessions have no TTS, so session.say() cannot speak a
        // fixed line. Ask the model to reply following the line instead: the
        // reply is spoken, and the transcript mirror below still records it.
        say: (text) => session.generateReply({ instructions: text }).waitForPlayout(),
        replyTo: (userInput) => void session.generateReply({ userInput }),
        inform: (instructions) => void session.generateReply({ instructions }),
    };
}

/**
 * LiveKit worker entry: one Master Tech per diagnostic-session room. Speech in
 * and out runs through the voice port (Gemini native audio by default); frames
 * and typed messages arrive on the data channel and are routed by
 * LiveChannelRouter.
 */
export default defineAgent({
    prewarm: async (proc) => {
        proc.userData.vad = await silero.VAD.load();
    },
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        const participant = await ctx.waitForParticipant();
        const sessionContext = parseSessionContext(
            ctx.room.name ?? 'unknown-session',
            participant.identity,
            participant.metadata,
        );
        logger.info('Master Tech joined room', { sessionId: sessionContext.sessionId });

        const publisher = new RoomPublisher(() => ctx.room.localParticipant);
        const voiceProfile = createVoice(env, livekitVoiceProviders);

        const session = new voice.AgentSession({
            vad: ctx.proc.userData.vad as silero.VAD,
            llm: voiceProfile.model,
        });

        // Mirror everything the agent says into the client's transcript.
        // 1.9.5 also reports agent handoffs on this event; only chat
        // messages carry a role and transcript text.
        session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
            if (item.type === 'message' && item.role === 'assistant' && item.textContent) {
                void publisher.transcript(item.textContent);
            }
        });

        const router = new LiveChannelRouter(
            sessionContext,
            conversationFor(session),
            bursts,
            {
                say: (text) => session.generateReply({ instructions: text }).waitForPlayout(),
                requestTool: (toolCall) => publisher.aiResponse({ type: 'tool_call', toolCall }),
            },
            logger,
        );
        ctx.room.on(
            RoomEvent.DataReceived,
            (payload: Uint8Array, sender?: RemoteParticipant, _kind?, topic?: string) => {
                void router.handle(payload, sender?.identity, topic);
            },
        );

        await session.start({
            agent: new voice.Agent({
                instructions: masterTechInstructions(describeVehicle(sessionContext.vehicle)),
                tools: createMasterTechTools(publisher),
            }),
            room: ctx.room,
        });
        logger.info('Master Tech ready', { voice: voiceProfile.kind });
    },
});
