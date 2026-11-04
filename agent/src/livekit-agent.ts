import { type JobContext, defineAgent, voice } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as resemble from '@livekit/agents-plugin-resemble';
import * as silero from '@livekit/agents-plugin-silero';
import { RoomEvent, RemoteParticipant, DataPacketKind } from '@livekit/rtc-node';
import { SystemPrompts } from '@lemonade/core';
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
    VertexAIVideoAdapter,
    GeminiFlashChatAndUploadsAdapter,
    NHTSAService,
    EmbeddingService,
    VectorRepository,
    SupermemoryService,
    SafetyMonitor,
    VertexAISafetyAdapter,
} from '@lemonade/infrastructure';
import { z } from 'zod';
import { env } from './env';

// Data channel topics
const VISUAL_BURST_REQUEST = 'capture_visual_burst';
const VISUAL_BURST_RESPONSE = 'visual_burst_response';
const PROACTIVE_PING = 'proactive_ping';

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

const visualAnalyzer = new VertexAIVideoAdapter(mainLogger, config);
const chatAI = new GeminiFlashChatAndUploadsAdapter(mainLogger, billingService, geminiCore, tracer, contextCache);
const nhtsa = new NHTSAService(mainLogger);
const embedding = new EmbeddingService(mainLogger, geminiCore);
const vectorRepo = new VectorRepository(mainLogger, geminiCore);
const memory = new SupermemoryService(mainLogger, config);
const safetyAI = new VertexAISafetyAdapter(config);
const safetyMonitor = new SafetyMonitor(safetyAI, mainLogger);

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
    mainLogger,
);

const liveStreamAnalyzer = new GeminiFlashLiveStreamAdapter(
    mainLogger,
    billingService,
    geminiCore,
    googleSearchService,
    contextCache,
    userRepo,
    sessionRepo,
    tracer,
);

export default defineAgent({
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        mainLogger.info(`Agent connected to room: ${ctx.room.name}`);

        // 1. Parse Metadata
        let vehicleContext = 'default-vehicle-context';
        const participantIdentity = ctx.job.participantIdentity;
        let userId = participantIdentity || 'unknown_participant';
        const sessionId = ctx.room.name;

        if (ctx.job.metadata) {
            try {
                const metadata: JobMetadata = JSON.parse(ctx.job.metadata);
                if (metadata.vehicleContext) vehicleContext = metadata.vehicleContext;
                if (metadata.userId) userId = metadata.userId;
            } catch (e: unknown) {
                mainLogger.warn('Failed to parse job metadata', { error: e as Error });
            }
        }

        // 2. Initialize Pipeline Components
        const tts = new resemble.TTS({
            apiKey: env.RESEMBLE_API_KEY,
        });

        const model = new google.realtime.RealtimeModel({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            temperature: 0.7,
            modalities: [google.realtime.Modality.TEXT],
            apiKey: config.getGoogleCloudConfig().apiKey,
        });

        // 3. Define Tools
        const tools = {
            start_video_stream: z
                .function()
                .describe('Request a visual burst (high-res frames) to inspect a part.')
                .args(
                    z.object({
                        component: z.string().describe('The part to see (e.g. "engine belt", "brake rotor")'),
                        reason: z.string().describe('Why you need to see it'),
                    }),
                )
                .implementation(async ({ component, reason }) => {
                    mainLogger.info(`AI requesting visual burst`, { component, reason });
                    ctx.room.localParticipant?.publishData(
                        new TextEncoder().encode(JSON.stringify({ type: VISUAL_BURST_REQUEST, component, reason })),
                        { topic: VISUAL_BURST_REQUEST, reliable: true },
                    );
                    return `Requesting visual data for ${component}. Please point your camera at it.`;
                }),
        };

        // 4. Create Voice Agent (Pipeline)
        const systemInstructions = `${SystemPrompts.identity()} ${SystemPrompts.primeDirectives()}
                   You are Lemonade, an AI Master Technician.
                   Current vehicle: ${vehicleContext}.
                   Prioritize safety above all.
                   Listen carefully to the engine and vehicle sounds.
                   If you hear knocks, hisses, or grinding, ask the user about them.`;

        const agent = new voice.Agent({
            vad: await silero.VAD.load(),
            llm: model,
            tts: tts,
            fncCtx: {
                tools: tools,
            },
            chatCtx: {
                system: systemInstructions,
            },
        });

        // 5. Start Agent
        const session = await agent.start(ctx.room);

        agent.on('synthesis_started', (event) => {
            if (event.text) {
                mainLogger.info('Agent speaking, sending text to client', { text: event.text });
                ctx.room.localParticipant?.publishData(
                    new TextEncoder().encode(
                        JSON.stringify({
                            type: 'chat',
                            analysis: { diagnosis: event.text },
                        }),
                    ),
                    { topic: 'ai_response', reliable: true },
                );
            }
        });

        const sayAndSend = async (text: string) => {
            session.chat.addToHistory({ role: 'assistant', content: text });
            await session.response.say(text);

            ctx.room.localParticipant?.publishData(
                new TextEncoder().encode(
                    JSON.stringify({
                        type: 'chat',
                        analysis: { diagnosis: text },
                    }),
                ),
                { topic: 'ai_response', reliable: true },
            );
        };

        // 6. Handle Semantic Bursts (Data Channel)
        ctx.room.on(
            RoomEvent.DataReceived,
            async (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacketKind, topic?: string) => {
                if (participant?.identity !== userId) return;

                if (topic === PROACTIVE_PING) {
                    try {
                        const ping = JSON.parse(new TextDecoder().decode(payload));
                        const { detection } = ping;
                        mainLogger.info(`Received Proactive Ping`, {
                            part: detection.id.obj,
                            risk: detection.eval.risk,
                        });

                        if (detection.eval.risk) {
                            await sayAndSend(
                                `I'm seeing something concerning with the ${detection.id.obj}. Analyzing now...`,
                            );
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
                        mainLogger.info(`Analyzing visual burst`, {
                            component,
                            frameCount: frames.length,
                            reason: metadata?.reason,
                        });

                        const localTriage = metadata?.localDetections
                            ? {
                                  detections: metadata.localDetections,
                                  timestamp: metadata.timestamp,
                              }
                            : undefined;

                        // Trigger C: Complexity Triage check
                        const hasComplexComponent = localTriage?.detections?.some((d: { objectId: string }) =>
                            ['abs', 'hybrid', 'transmission', 'ecu'].includes(d.objectId.toLowerCase()),
                        );

                        if (hasComplexComponent) {
                            mainLogger.info('Triggering System 2: Complex component detected locally', {
                                detections: localTriage?.detections,
                            });
                            await sayAndSend(`Scanning complex ${component} system. One moment...`);

                            const diagnosis = await mechanicReasoningService.diagnose({
                                userQuery: `Analyze ${component} for issues.`,
                                vehicleContext:
                                    typeof vehicleContext === 'string' ? JSON.parse(vehicleContext) : vehicleContext,
                                sessionId: sessionId || 'unknown-session',
                                userId: userId,
                                localTriage: localTriage,
                            });

                            await sayAndSend(diagnosis.finalDiagnosis.userOutput);
                            return;
                        }

                        const analysis = await liveStreamAnalyzer.analyzeLiveImageFrame(
                            frames[0],
                            'image/jpeg',
                            vehicleContext,
                            userId,
                            sessionId || 'unknown-session',
                            (typeof vehicleContext === 'string' ? JSON.parse(vehicleContext) : vehicleContext)?.vin,
                            Date.now(),
                            localTriage,
                        );

                        if (analysis) {
                            if (Array.isArray(analysis)) {
                                // Handle Tool Calls triggered during live stream
                                for (const part of analysis) {
                                    if (part.type === 'tool-call') {
                                        mainLogger.info(`Agent passing live tool call: ${part.toolName}`);
                                        ctx.room.localParticipant?.publishData(
                                            new TextEncoder().encode(
                                                JSON.stringify({
                                                    type: 'tool_call',
                                                    toolCall: {
                                                        id: part.toolCallId,
                                                        name: part.toolName,
                                                        args: part.args,
                                                    },
                                                }),
                                            ),
                                            { topic: 'ai_response', reliable: true },
                                        );
                                    }
                                }
                            } else {
                                // Handle standard Analysis
                                await sayAndSend(`I've analyzed the ${component}. ${analysis.diagnosis}`);
                            }
                        }
                    }
                } catch (err) {
                    mainLogger.error('Failed to process burst data', { error: err as Error });
                }
            },
        );

        mainLogger.info('Master Tech Agent ready (Gemini Realtime + Resemble)');
    },
});
