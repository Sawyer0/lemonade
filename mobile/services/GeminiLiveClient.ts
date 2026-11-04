import { ILogger, IRealtimeAIService, VehicleContext } from '@lemonade/core';

export type LiveConfig = {
    model: string;
    generationConfig?: {
        responseModalities: ('audio' | 'image' | 'text')[];
        speechConfig?: {
            voiceConfig: {
                prebuiltVoiceConfig: {
                    voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';
                };
            };
        };
    };
    systemInstruction?: {
        parts: { text: string }[];
    };
};

export class GeminiLiveClient implements IRealtimeAIService {
    private ws: WebSocket | null = null;
    private url: string;
    private onMessage: (data: unknown) => void;
    private onError: (error: Error) => void;
    private config: LiveConfig;
    private logger: ILogger;
    private traceId: string;
    private vehicleContext: VehicleContext;

    private isConnectedVal = false;

    constructor(
        config: LiveConfig,
        vehicleContext: VehicleContext,
        onMessage: (data: unknown) => void,
        onError: (error: Error) => void,
        logger: ILogger,
        traceId: string,
    ) {
        this.config = config;
        this.vehicleContext = vehicleContext;
        this.onMessage = onMessage;
        this.onError = onError;
        this.logger = logger;
        this.traceId = traceId;
        // Base URL
        this.url =
            'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
    }

    async connect(apiKey: string) {
        try {
            if (this.ws) {
                this.ws.close();
            }
            // Append API Key as query parameter
            const wsUrl = `${this.url}?key=${apiKey}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.logger.info('Connected to Gemini Live', { url: this.url, traceId: this.traceId });
                this.isConnectedVal = true;
                this.sendSetupMessage();
            };

            this.ws.onmessage = (event) => {
                let data;
                if (typeof event.data === 'string') {
                    data = JSON.parse(event.data);
                } else {
                    this.logger.error('Received non-string message type from Gemini WebSocket', undefined, {
                        type: typeof event.data,
                        traceId: this.traceId,
                    });
                    this.onError(new Error('Received non-string message type from Gemini WebSocket'));
                    return;
                }
                this.onMessage(data);
            };

            this.ws.onerror = (e) => {
                this.logger.error('WebSocket Error', e, { traceId: this.traceId });
                this.onError(new Error('WebSocket Error'));
                this.isConnectedVal = false;
            };

            this.ws.onclose = () => {
                this.logger.info('Gemini Live Disconnected', { traceId: this.traceId });
                this.isConnectedVal = false;
            };
        } catch (e) {
            this.logger.error('Connection Failed', e as Error, { traceId: this.traceId });
            throw e;
        }
    }

    get isConnected() {
        return this.isConnectedVal && this.ws?.readyState === WebSocket.OPEN;
    }

    disconnect() {
        this.ws?.close();
        this.isConnectedVal = false;
    }

    private sendSetupMessage() {
        if (!this.isConnected) return;

        const msg = {
            setup: {
                model: this.config.model,
                generationConfig: this.config.generationConfig,
                systemInstruction: this.config.systemInstruction,
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: 'start_video_stream',
                                description: "Opens the user's camera to see their vehicle/engine.",
                            },
                            {
                                name: 'checkRecalls',
                                description:
                                    'Checks for active safety recalls for the specific vehicle (Year/Make/Model).',
                            },
                            {
                                name: 'googleSearch',
                                description: 'Search for vehicle resources using Google Search.',
                                parameters: {
                                    type: 'OBJECT',
                                    properties: {
                                        query: { type: 'STRING' },
                                    },
                                    required: ['query'],
                                },
                            },
                        ],
                    },
                ],
            },
        };
        this.ws?.send(JSON.stringify(msg));
    }

    sendRealtimeInput(chunks: { mimeType: string; data: string }[]) {
        if (!this.isConnected) {
            this.logger.warn('Attempted to send Realtime Input while disconnected', { traceId: this.traceId });
            throw new Error('Gemini Live Client is not connected.');
        }
        const msg = {
            realtimeInput: {
                mediaChunks: chunks,
            },
        };
        this.ws?.send(JSON.stringify(msg));
    }

    sendToolResponse(response: unknown) {
        if (!this.isConnected) {
            this.logger.warn('Attempting to send tool response while disconnected', { traceId: this.traceId });
            return;
        }
        const msg = {
            toolResponse: response,
        };
        this.ws?.send(JSON.stringify(msg));
    }

    sendText(text: string) {
        if (!this.isConnected) {
            this.logger.warn('Attempted to send Text while disconnected', { traceId: this.traceId });
            throw new Error('Gemini Live Client is not connected.');
        }
        const msg = {
            clientContent: {
                turns: [
                    {
                        role: 'user',
                        parts: [{ text }],
                    },
                ],
                turnComplete: true,
            },
        };
        this.ws?.send(JSON.stringify(msg));
    }

    send(data: string | object) {
        if (!this.isConnected) {
            this.logger.warn('Attempted to send data while disconnected', { traceId: this.traceId });
            return;
        }
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        this.ws?.send(payload);
    }
}
