import { type JobContext, defineAgent, voice } from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { RoomEvent, type RemoteParticipant } from '@livekit/rtc-node';
import type { ICaseRepository, ILiveStreamAnalyzer } from '@lemonade/core';
import { Logger, TYPES, createContainer } from '@lemonade/infrastructure';
import { loadEnv } from './env';
import { LiveChannelRouter, type Conversation } from './channel/LiveChannelRouter';
import { RoomPublisher } from './channel/roomPublisher';
import { BurstAnalyzer, type DiagnosticJobSubmission } from './diagnosis/BurstAnalyzer';
import { describeVehicle, parseSessionContext } from './diagnosis/sessionContext';
import { JobClient } from './jobs/JobClient';
import { createDiagnosticJobTools } from './talker/DiagnosticJobTools';
import { ResultInjector } from './talker/ResultInjector';
import type { TalkerSession } from './talker/TalkerSession';
import { masterTechInstructions } from './voice/instructions';
import { createMasterTechTools } from './voice/tools';
import { createVoiceProvider } from './voice/provider';
import { livekitPlugins } from './voice/livekitPlugins';
import { createTranscriptSink } from './voice/transcriptLedger';

const env = loadEnv();
const logger = new Logger();

// Frame analysis needs the media model (Vertex by default) and Firestore.
// Build that graph on the first frame, so a voice-only call (and the live
// e2e test) needs only LiveKit and Gemini. The analyzer files complex
// systems as job tickets now (LM-14); the per-call job port comes from the
// router, so this lazy object stays session-independent.
let burstAnalyzer: BurstAnalyzer | undefined;
const bursts: Pick<BurstAnalyzer, 'analyze'> = {
    analyze: (...args) => {
        if (!burstAnalyzer) {
            burstAnalyzer = new BurstAnalyzer(createContainer().get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI));
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
 * Adapts the LiveKit AgentSession to the injector's TalkerSession port.
 * Silent context goes in as a user turn the model is told not to answer
 * directly: the Gemini plugin forwards it with turnComplete false, so it
 * lands in context without generating speech. Findings wait for an idle
 * gap, hold it while speaking, then speak; a safety stop cuts current
 * speech and speaks a reply the user cannot talk over.
 */
function talkerSessionFor(session: voice.AgentSession): TalkerSession {
    return {
        addSilentContext: async (text) => {
            const next = session.chatCtx;
            next.addMessage({
                role: 'user',
                content: `[Diagnostic update. Context only, do not answer this directly.]\n${text}`,
            });
            await session.currentAgent.updateChatCtx(next);
        },
        speakAtIdle: async (text) => {
            // Hold the idle gap while speaking: a second finding's
            // waitForIdleAndHold waits for this hold to release, so two
            // jobs' findings cannot race into generateReply concurrently.
            return session.waitForIdleAndHold(async () => {
                const handle = session.generateReply({ instructions: text });
                await handle.waitForPlayout();
                return handle.interrupted ? 'interrupted' : 'delivered';
            });
        },
        interruptAndSpeak: async (text) => {
            await session.interrupt({ force: true });
            const handle = session.generateReply({ instructions: text, allowInterruptions: false });
            await handle.waitForPlayout();
        },
    };
}

/**
 * LiveKit worker entry: one Master Tech per diagnostic-session room. Speech in
 * and out runs through the voice provider named by VOICE_PROVIDER (gemini,
 * grok, or cascade); the AgentSession owns start/stop, audio, tools,
 * interrupt and transcripts for every provider, so switching providers is a
 * config change. Frames and typed messages arrive on the data channel and
 * are routed by LiveChannelRouter.
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
        const provider = createVoiceProvider(env, livekitPlugins);

        // Every turn's transcript lands in the case ledger as a `transcript`
        // event, whatever the provider. The repository resolves lazily on the
        // first turn; a missing database fails the ledger, never the call.
        const transcripts = createTranscriptSink({
            caseId: sessionContext.caseId,
            userId: sessionContext.userId,
            provider: provider.id,
            repository: () => createContainer().get<ICaseRepository>(TYPES.CaseRepo),
            logger,
        });

        const session = new voice.AgentSession({
            vad: ctx.proc.userData.vad as silero.VAD,
            ...provider.sessionParts(),
        });

        // Mirror everything the agent says into the client's transcript.
        // 1.9.5 also reports agent handoffs on this event; only chat
        // messages carry a role and transcript text.
        session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
            if (item.type === 'message' && item.role === 'assistant' && item.textContent) {
                void publisher.transcript(item.textContent);
                void transcripts.record('assistant', item.textContent);
            }
        });

        // Record what the user said. Interim transcripts are skipped: only
        // the final text of a turn belongs in the ledger.
        session.on(voice.AgentSessionEventTypes.UserInputTranscribed, ({ transcript, isFinal }) => {
            if (isFinal && transcript) {
                void transcripts.record('user', transcript);
            }
        });

        // Talker/reasoner split (LM-14): the talker files diagnostic jobs
        // with the Lemonade job service and keeps talking; the injector
        // delivers the reasoner's events back onto this session.
        const jobClient = new JobClient(env.JOBS_BASE_URL, env.MAIN_APP_API_KEY);
        const injector = new ResultInjector(jobClient, talkerSessionFor(session), logger);
        const jobSubmission: DiagnosticJobSubmission = {
            submitJob: (request) => jobClient.submitJob(request),
            trackJob: (jobId) => injector.track(jobId),
        };

        const router = new LiveChannelRouter(
            sessionContext,
            conversationFor(session),
            bursts,
            {
                say: (text) => session.generateReply({ instructions: text }).waitForPlayout(),
                requestTool: (toolCall) => publisher.aiResponse({ type: 'tool_call', toolCall }),
            },
            logger,
            jobSubmission,
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
                tools: {
                    ...createMasterTechTools(publisher),
                    ...createDiagnosticJobTools(jobClient, injector, sessionContext),
                },
            }),
            room: ctx.room,
        });
        logger.info('Master Tech ready', { voice: provider.id });

        // Jobs belong to the case, not this Gemini connection: after a
        // reconnect the new session resumes the case's jobs, and any result
        // that landed while away is delivered at the next idle gap.
        if (sessionContext.caseId) void injector.resumeForCase(sessionContext.caseId);
        ctx.room.on(RoomEvent.Disconnected, () => injector.stop());
    },
});
