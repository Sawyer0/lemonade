// functions/livekit-agent/src/livekit-agent.ts
import {
    Agent,
    AgentCallbacks,
    createAudioTrack,
    InMemorySessionStore,
    JobContext,
    Room,
    RoomEvent,
    Track,
    LogLevel as AgentLogLevel
} from '@livekit/agents';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { env } from './env';
import { ILiveStreamAnalyzer, AIAnalysis, JobMetadata, MessagePart } from './types';

// Configuration for LiveKit Agent behavior
const LIVEKIT_AGENT_CONFIG = {
    AUDIO_CHUNK_INTERVAL_MS: env.LIVEKIT_AGENT_AUDIO_CHUNK_INTERVAL_MS ? parseInt(env.LIVEKIT_AGENT_AUDIO_CHUNK_INTERVAL_MS) : 2000,
    MIN_AUDIO_CHUNK_DURATION_MS: 500,
    AGENT_IDENTITY: 'GeminiMasterTechAgent',
    AGENT_DISPLAY_NAME: 'Gemini Master Tech Agent',
    MAX_SESSION_DURATION_MINUTES: 60,
    LOG_LEVEL: AgentLogLevel.INFO,
    AUDIO_SAMPLE_RATE: 48000,
    AUDIO_CHANNELS: 1,
    AUDIO_BIT_DEPTH: 16,
};

const AI_RESPONSE_TOPIC = "ai_response";
const CHAT_TOPIC = "chat_message";
const TOOL_RESPONSE_TOPIC = "tool_response";
const VISUAL_BURST_REQUEST = "capture_visual_burst"; // Agent -> Client
const VISUAL_BURST_RESPONSE = "visual_burst_response"; // Client -> Agent

interface LiveKitAgentServices {
    liveStreamAnalyzer: ILiveStreamAnalyzer;
    chatAssistantAI: IChatAssistantAI;
}

// Interface re-definition for clarity if not imported
interface IChatAssistantAI {
    generateReply(
        history: any[],
        message: string,
        vehicleContext: string,
        diagnosticContext: any | null,
        userId: string,
        sessionId: string,
        reasoningEffort?: any,
        additionalParts?: any[]
    ): Promise<string | MessagePart[]>;
}

export class LiveKitMasterTechAgent {
    private agent: Agent;
    private services: LiveKitAgentServices;
    private roomServiceClient: RoomServiceClient;

    constructor(services: LiveKitAgentServices) {
        this.services = services;
        this.roomServiceClient = new RoomServiceClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

        const callbacks: AgentCallbacks = {
            onJob: this.onJob.bind(this),
            onWorkerStarted: () => console.log('LiveKit Master Tech Agent Worker Started'),
            onWorkerStopped: () => console.log('LiveKit Master Tech Agent Worker Stopped'),
            onJobComplete: (job) => console.log(`Job ${job.id} completed`),
            onJobFailed: (job, error) => console.error(`Job ${job.id} failed: ${error}`),
        };

        this.agent = new Agent(callbacks, {
            token: this.getAgentToken.bind(this),
            roomServiceClient: this.roomServiceClient,
            sessionStore: new InMemorySessionStore(),
            logLevel: LIVEKIT_AGENT_CONFIG.LOG_LEVEL,
        });
    }

    private getAgentToken(job: JobContext): string {
        const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
            identity: LIVEKIT_AGENT_CONFIG.AGENT_IDENTITY,
            name: LIVEKIT_AGENT_CONFIG.AGENT_DISPLAY_NAME,
        });
        at.addGrant({
            roomJoin: true,
            room: job.roomName,
            canPublish: true,
            canSubscribe: true,
        });
        return at.toJwt();
    }

    private async onJob(job: JobContext) {
        const room = await job.room.init();
        console.log(`Agent joined room ${room.name}`);

        const participantIdentity = job.participantIdentity || 'unknown_participant';
        const sessionId = job.roomName;
        let vehicleContext = 'default-vehicle-context';
        let userId = participantIdentity;

        if (job.metadata) {
            try {
                const metadata: JobMetadata = JSON.parse(job.metadata);
                if (metadata.vehicleContext) vehicleContext = metadata.vehicleContext;
                if (metadata.userId) userId = metadata.userId;
            } catch (e) {
                console.warn(`Failed to parse job metadata: ${job.metadata}, using defaults.`);
            }
        }

        const audioProcessors = new Map<string, AudioStreamProcessor>();
        const chatHistories = new Map<string, any[]>();

        const setupAudioProcessor = (participantId: string, track: Track) => {
            if (track.kind === Track.Kind.Audio && track.source === TrackSource.Microphone) {
                if (!audioProcessors.has(participantId)) {
                    const audioProcessor = new AudioStreamProcessor(
                        room,
                        this.services.liveStreamAnalyzer,
                        sessionId,
                        userId,
                        vehicleContext
                    );
                    audioProcessors.set(participantId, audioProcessor);
                    audioProcessors.start();
                    audioProcessor.setupAudioReceiver(track);
                }
            }
        };

        room.participants.forEach(p => {
            p.publishedTracks.forEach(pub => {
                if (pub.isSubscribed) {
                    setupAudioProcessor(p.identity, pub.track!);
                }
            });
        });

        room.on(RoomEvent.TrackPublished, (publication) => {
            if (publication.isSubscribed) {
                setupAudioProcessor(publication.participant.identity, publication.track!);
            }
        });

        // --- Handle Data Channels ---
        room.on(RoomEvent.DataReceived, async (payload: Uint8Array, participant, topic) => {
            let history = chatHistories.get(sessionId) || [];

            if (topic === CHAT_TOPIC) {
                try {
                    const messageString = Buffer.from(payload).toString('utf8');
                    const userMessage = JSON.parse(messageString);

                    history.push(userMessage);
                    chatHistories.set(sessionId, history);

                    console.log(`Chat: ${userMessage.content}`);

                    const aiReply = await this.services.chatAssistantAI.generateReply(
                        history,
                        userMessage.content,
                        vehicleContext,
                        null,
                        userId,
                        sessionId
                    );

                    await this.processAiReply(aiReply, history, sessionId, room);

                } catch (error) {
                    console.error('Error processing chat:', error);
                }
            } else if (topic === TOOL_RESPONSE_TOPIC) {
                 try {
                    const messageString = Buffer.from(payload).toString('utf8');
                    const toolResponseMsg = JSON.parse(messageString);

                    // Add tool response to history
                    history.push({
                         role: 'function',
                         parts: [{
                             functionResponse: {
                                 name: toolResponseMsg.toolCallId,
                                 response: { result: toolResponseMsg.response } 
                             }
                         }]
                    });
                    chatHistories.set(sessionId, history);

                    console.log(`Tool response: ${toolResponseMsg.toolCallId}`);

                    const aiReply = await this.services.chatAssistantAI.generateReply(
                        history,
                        '', 
                        vehicleContext,
                        null,
                        userId,
                        sessionId
                    );
                    
                    await this.processAiReply(aiReply, history, sessionId, room);

                 } catch(error) {
                     console.error("Error processing tool response:", error);
                 }
            } else if (topic === VISUAL_BURST_RESPONSE) {
                // Handle the 3-frame burst from the client
                try {
                    const messageString = Buffer.from(payload).toString('utf8');
                    const { frames } = JSON.parse(messageString) as { frames: string[] };

                    if (frames && frames.length > 0) {
                        console.log(`Received visual burst: ${frames.length} frames.`);
                        
                        // Inject frames into history as a user message with inline data
                        const frameParts = frames.map(base64 => ({
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: base64
                            }
                        }));

                        const contextMessage = {
                            role: 'user',
                            parts: [
                                { text: "Here is the visual context you requested (recent frames)." },
                                ...frameParts
                            ]
                        };
                        
                        history.push(contextMessage);
                        chatHistories.set(sessionId, history);

                        // Call AI again with the new visual context
                        const aiReply = await this.services.chatAssistantAI.generateReply(
                            history,
                            '', 
                            vehicleContext,
                            null,
                            userId,
                            sessionId
                        );

                        await this.processAiReply(aiReply, history, sessionId, room);
                    }
                } catch (error) {
                    console.error("Error processing visual burst:", error);
                }
            }
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
            if (audioProcessors.has(participant.identity)) {
                audioProcessors.get(participant.identity)?.stop();
                audioProcessors.delete(participant.identity);
            }
        });

        room.enableSpeechDetection();

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const humanSpeakers = speakers.filter(s => s.identity !== LIVEKIT_AGENT_CONFIG.AGENT_IDENTITY);
            if (humanSpeakers.length > 0) {
                room.localParticipant.publishData(
                     new TextEncoder().encode(JSON.stringify({ type: 'barge-in' })),
                     { topic: AI_RESPONSE_TOPIC, reliable: true }
                );
            }
        });

        room.on(RoomEvent.Disconnected, () => {
            audioProcessors.forEach(p => p.stop());
            audioProcessors.clear();
        });

        setTimeout(() => {
            if (room) room.disconnect();
        }, LIVEKIT_AGENT_CONFIG.MAX_SESSION_DURATION_MINUTES * 60 * 1000);
    }

    private async processAiReply(
        aiReply: string | MessagePart[], 
        history: any[], 
        sessionId: string, 
        room: Room
    ) {
        if (typeof aiReply === 'string') {
             history.push({ role: 'assistant', content: aiReply, timestamp: new Date() });
             room.localParticipant.publishData(
                 new TextEncoder().encode(JSON.stringify({ type: 'chat', analysis: { diagnosis: aiReply } })),
                 { topic: AI_RESPONSE_TOPIC, reliable: true }
             );
        } else if (Array.isArray(aiReply)) {
             for (const part of aiReply) {
                 if (part.text) {
                     history.push({ role: 'assistant', content: part.text, timestamp: new Date() });
                     room.localParticipant.publishData(
                         new TextEncoder().encode(JSON.stringify({ type: 'chat', analysis: { diagnosis: part.text } })),
                         { topic: AI_RESPONSE_TOPIC, reliable: true }
                     );
                 } else if (part.toolCallId) {
                      // Check for the Visual Burst tool
                      if (part.toolName === 'capture_visual_context' || part.toolName === 'inspect_visual_scene') {
                          console.log("AI requested visual context. Triggering burst...");
                          
                          room.localParticipant.publishData(
                              new TextEncoder().encode(JSON.stringify({ request: 'burst' })),
                              { topic: VISUAL_BURST_REQUEST, reliable: true }
                          );
                          
                          history.push({ 
                              role: 'assistant', 
                              content: null, 
                              functionCall: { name: part.toolName, args: part.args } 
                          });
                      } else {
                          // Standard Tool Call
                          history.push({ 
                              role: 'assistant', 
                              content: null, 
                              functionCall: { name: part.toolName, args: part.args } 
                          });

                          room.localParticipant.publishData(
                             new TextEncoder().encode(JSON.stringify({ 
                                 type: 'tool_call', 
                                 toolCall: { id: part.toolCallId, name: part.toolName, args: part.args }
                             })),
                             { topic: AI_RESPONSE_TOPIC, reliable: true }
                         );
                      }
                 }
             }
        }
    }

    public start() {
        this.agent.start();
        console.log('Agent started.');
    }

    public stop() {
        this.agent.stop();
        console.log('Agent stopped.');
    }
}

class AudioStreamProcessor {
    private audioBuffer: { data: Buffer; timestamp: number }[] = [];
    private lastChunkSentTime = 0;
    private intervalId: NodeJS.Timeout | null = null;
    private _room: Room;
    private _liveStreamAnalyzer: ILiveStreamAnalyzer;
    private _sessionId: string;
    private _userId: string;
    private _vehicleContext: string;

    constructor(
        room: Room,
        liveStreamAnalyzer: ILiveStreamAnalyzer,
        sessionId: string,
        userId: string,
        vehicleContext: string
    ) {
        this._room = room;
        this._liveStreamAnalyzer = liveStreamAnalyzer;
        this._sessionId = sessionId;
        this._userId = userId;
        this._vehicleContext = vehicleContext;
    }

    public setupAudioReceiver(track: Track) {
        const audioTrack = createAudioTrack(track);
        audioTrack.on('audio', (audioBuffer: Buffer) => {
            this.audioBuffer.push({ data: audioBuffer, timestamp: Date.now() });
        });
    }

    public start() {
        if (this.intervalId) return;

        this.intervalId = setInterval(async () => {
            const now = Date.now();
            if (now - this.lastChunkSentTime < LIVEKIT_AGENT_CONFIG.AUDIO_CHUNK_INTERVAL_MS) {
                return;
            }

            if (this.audioBuffer.length > 0) {
                const combinedAudioData = Buffer.concat(this.audioBuffer.map(b => b.data));
                this.audioBuffer = [];

                const bytesPerSample = LIVEKIT_AGENT_CONFIG.AUDIO_BIT_DEPTH / 8;
                const sampleRate = LIVEKIT_AGENT_CONFIG.AUDIO_SAMPLE_RATE;
                const channels = LIVEKIT_AGENT_CONFIG.AUDIO_CHANNELS;
                const audioDurationMs = (combinedAudioData.length / (bytesPerSample * sampleRate * channels)) * 1000;

                if (combinedAudioData.length > 0 && audioDurationMs >= LIVEKIT_AGENT_CONFIG.MIN_AUDIO_CHUNK_DURATION_MS) {
                    try {
                        const base64Audio = combinedAudioData.toString('base64');
                        const mimeType = 'audio/pcm';

                        const analysis = await this._liveStreamAnalyzer.analyzeLiveAudioChunk(
                            base64Audio,
                            mimeType,
                            this._vehicleContext,
                            this._userId,
                            this._sessionId,
                            audioDurationMs / 1000,
                            now
                        );
                        if (analysis) {
                            console.log('Audio Analysis:', analysis);
                            this._room.localParticipant.publishData(
                                new TextEncoder().encode(JSON.stringify({ type: 'audio', analysis })),
                                { topic: AI_RESPONSE_TOPIC, reliable: true }
                            );
                        }
                    } catch (error) {
                        console.error('Audio chunk error:', error);
                    } finally {
                        this.lastChunkSentTime = now;
                    }
                }
            }
        }, LIVEKIT_AGENT_CONFIG.AUDIO_CHUNK_INTERVAL_MS / 2);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
