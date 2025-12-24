import { type JobContext, defineAgent, voice, llm } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as resemble from '@livekit/agents-plugin-resemble';
import * as silero from '@livekit/agents-plugin-silero';
import { RoomEvent, RemoteParticipant, DataPacketKind } from '@livekit/rtc-node';
import {
    type ILogger,
    SHARED_CONFIG,
    SYSTEM_PROMPTS,
} from '@lemonade/core';
import {
    EnvConfigProvider,
    Logger,
    TracingService,
    GeminiFlashLiveStreamAdapter,
    GeminiCoreAdapter,
    ContextCacheService,
    FirestoreSessionRepository,
    FirestoreUserRepository,
    BillingService,
    BillingFirestoreRepository,
    GoogleSearchService,
    MechanicReasoningService,
    ReactiveSafetyService,
} from '@lemonade/infrastructure';
import { z } from 'zod';
import { env } from './env';

// Data channel topics
const VISUAL_BURST_REQUEST = "capture_visual_burst";
const VISUAL_BURST_RESPONSE = "visual_burst_response";
const PROACTIVE_PING = "proactive_ping";

interface JobMetadata {
    vehicleContext?: string;
    userId?: string;
}

// Global Singletons for Infrastructure
const config = new EnvConfigProvider();
const mainLogger = new Logger();
const tracer = new TracingService(config);

const geminiCore = new GeminiCoreAdapter(mainLogger, config);
const contextCache = new ContextCacheService(mainLogger, config);
const sessionRepo = new FirestoreSessionRepository(mainLogger);
const userRepo = new FirestoreUserRepository(mainLogger);
const billingRepo = new BillingFirestoreRepository(mainLogger);
const billingService = new BillingService(billingRepo);
const googleSearchService = new GoogleSearchService(mainLogger, billingService, config);
const reactiveSafetyService = new ReactiveSafetyService();

const visualAnalyzer = new (google as any).beta.MultimodalUploadAnalyzer(mainLogger, config);
const chatAI = new (google as any).beta.GeminiFlashChatAndUploadsAdapter(mainLogger, billingService, geminiCore, tracer, contextCache);
const nhtsa = new (google as any).beta.NHTSAService(mainLogger, config);
const embedding = new (google as any).beta.EmbeddingService(mainLogger, config);
const vectorRepo = new (google as any).beta.VectorRepository(mainLogger);
const memory = new (google as any).beta.SupermemoryService(mainLogger, config); // Mocking or injecting properly if available
const safetyMonitor = new (google as any).beta.SafetyMonitor(mainLogger);

const mechanicReasoningService = new MechanicReasoningService(
    visualAnalyzer,
    chatAI,
    nhtsa,
    embedding,
    vectorRepo,
    googleSearchService,
    memory,
    reactiveSafetyService,
    safetyMonitor,
    tracer,
    mainLogger
);

const liveStreamAnalyzer = new GeminiFlashLiveStreamAdapter(
    mainLogger,
    billingService,
    geminiCore,
    googleSearchService,
    contextCache,
    userRepo,
    sessionRepo,
    tracer
);

export default defineAgent({
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        mainLogger.info(`Agent connected to room: ${ctx.room.name}`);

        // 1. Parse Metadata
        let vehicleContext = 'default-vehicle-context';
        const participantIdentity = (ctx.job as any).participantIdentity;
        let userId = participantIdentity || 'unknown_participant';
        const sessionId = ctx.room.name;

        if ((ctx.job as any).metadata) {
            try {
                const metadata: JobMetadata = JSON.parse((ctx.job as any).metadata);
                if (metadata.vehicleContext) vehicleContext = metadata.vehicleContext;
                if (metadata.userId) userId = metadata.userId;
            } catch (e: unknown) {
                mainLogger.warn('Failed to parse job metadata', { error: e as Error });
            }
        }

        // 2. Initialize Pipeline Components
        // STT: Deepgram (Ears)
        const stt = new deepgram.STT({
            apiKey: env.DEEPGRAM_API_KEY,
            model: "nova-3-general"
        });

        // TTS: Resemble (Voice)
        const tts = new resemble.TTS({
            apiKey: env.RESEMBLE_API_KEY,
        });

        // LLM: Google Gemini Flash (Brain) - Standard Text API
        const model = new (google as any).LLM({
            model: 'gemini-1.5-flash-002',
            apiKey: config.getGoogleCloudConfig().apiKey,
        });

        // 3. Define Tools
        const tools = {
            start_video_stream: llm.tool({
                description: 'Request a visual burst (high-res frames) to inspect a part.',
                parameters: z.object({
                    component: z.string().describe('The part to see (e.g. "engine belt", "brake rotor")'),
                    reason: z.string().describe('Why you need to see it')
                }),
                execute: async ({ component, reason }) => {
                    mainLogger.info(`AI requesting visual burst`, { component, reason });
                    ctx.room.localParticipant?.publishData(
                        new TextEncoder().encode(JSON.stringify({ type: VISUAL_BURST_REQUEST, component, reason })),
                        { topic: VISUAL_BURST_REQUEST, reliable: true }
                    );
                    return `Requesting visual data for ${component}. Please point your camera at it.`;
                }
            })
        };

        // 4. Create Voice Agent (Pipeline)
        const systemInstructions = `${SYSTEM_PROMPTS.IDENTITY} ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}
                   You are Lemonade, an AI Master Technician.
                   Current vehicle: ${vehicleContext}.
                   Prioritize safety above all.`;

        const agent = new voice.Agent({
            vad: await silero.VAD.load(),
            stt: stt as any,
            llm: model,
            tts: tts as any,
            tools: tools, // Use tools directly in Agent options
            instructions: systemInstructions
        });

        // 5. Start Agent
        // Use agent.session to start since Agent orchestrates but Session runs it
        await agent.session.start({
            agent,
            room: ctx.room,
        });

        // 6. Handle Semantic Bursts (Data Channel)
        ctx.room.on(RoomEvent.DataReceived, async (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacketKind, topic?: string) => {
            if (participant?.identity !== userId) return;

            if (topic === PROACTIVE_PING) {
                try {
                    const ping = JSON.parse(new TextDecoder().decode(payload));
                    const { detection } = ping;
                    mainLogger.info(`Received Proactive Ping`, { part: detection.id.obj, risk: detection.eval.risk });
                    
                    // The agent can choose to acknowledge the ping verbally if it's high risk
                    if (detection.eval.risk) {
                        agent.session.say(`I'm seeing something concerning with the ${detection.id.obj}. Analyzing now...`);
                    }
                } catch (e) {
                    mainLogger.warn('Failed to parse proactive ping', { error: e as Error });
                }
                return;
            }

            if (topic !== VISUAL_BURST_RESPONSE) return;

            try {
                const packet = JSON.parse(new TextDecoder().decode(payload));
                const { frames, component, metadata } = packet;

                if (frames?.length) {
                    mainLogger.info(`Analyzing visual burst`, { component, frameCount: frames.length, reason: metadata?.reason });

                    const localTriage = metadata?.localDetections ? {
                        detections: metadata.localDetections,
                        timestamp: metadata.timestamp
                    } : undefined;

                    // Trigger C: Complexity Triage check
                    const hasComplexComponent = localTriage?.detections?.some((d: any) =>
                        ['abs', 'hybrid', 'transmission', 'ecu'].includes(d.objectId.toLowerCase())
                    );

                    if (hasComplexComponent) {
                        mainLogger.info('Triggering System 2: Complex component detected locally', { detections: localTriage?.detections });
                        agent.session.say(`Scanning complex ${component} system. One moment...`); // Use session.say

                        const diagnosis = await mechanicReasoningService.diagnose({
                            userQuery: `Analyze ${component} for issues.`,
                            vehicleContext: typeof vehicleContext === 'string' ? JSON.parse(vehicleContext) : vehicleContext,
                            sessionId: sessionId || 'unknown-session',
                            userId: userId,
                            localTriage: localTriage
                        });

                        agent.session.say(diagnosis.finalDiagnosis.userOutput); // Use session.say
                        return;
                    }

                    const analysis = await liveStreamAnalyzer.analyzeLiveImageFrame(
                        frames[0],
                        'image/jpeg',
                        vehicleContext,
                        userId,
                        sessionId || 'unknown-session',
                        Date.now(),
                        localTriage
                    );

                    if (analysis) {
                        if (Array.isArray(analysis)) {
                            // Handle Tool Calls triggered during live stream
                            for (const part of analysis) {
                                if (part.type === 'tool-call') {
                                    mainLogger.info(`Agent passing live tool call: ${part.toolName}`);
                                    ctx.room.localParticipant?.publishData(
                                        new TextEncoder().encode(JSON.stringify({
                                            type: 'tool_call',
                                            toolCall: { id: part.toolCallId, name: part.toolName, args: part.args }
                                        })),
                                        { topic: 'ai_response', reliable: true }
                                    );
                                }
                            }
                        } else {
                            // Handle standard Analysis
                            agent.session.say(`I've analyzed the ${component}. ${analysis.diagnosis}`); // Use session.say
                        }
                    }
                }
            } catch (err) {
                mainLogger.error('Failed to process burst data', { error: err as Error });
            }
        });

        mainLogger.info('Master Tech Agent ready (VoicePipeline w/ Deepgram+Resemble)');
    }
});