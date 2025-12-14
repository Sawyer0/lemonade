// functions/livekit-agent/src/ai-api-client.ts
import { ILiveStreamAnalyzer, AIAnalysis, MessagePart, IChatAssistantAI, ReasoningEffort } from './types';
import { env } from './env';
import { Part } from '@google-cloud/vertexai'; // Required for Part type in countTokens

interface AiApiClientConfig {
    baseUrl: string;
    apiKey: string; // New: API Key for authentication
}

export class AiApiClient implements ILiveStreamAnalyzer, IChatAssistantAI { // Implement IChatAssistantAI
    private config: AiApiClientConfig;

    constructor(config: AiApiClientConfig) {
        this.config = config;
    }

    private async callApi<T>(endpoint: string, method: string, body: any): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': this.config.apiKey, // Add auth headers here
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            return await response.json() as T;
        } catch (error) {
            console.error(`Error calling AI API endpoint ${endpoint}:`, error);
            throw error;
        }
    }

    async analyzeLiveImageFrame(
        imageData: string, mimeType: string, vehicleContext: string,
        userId: string, sessionId: string, inputTimestamp?: number
    ): Promise<AIAnalysis | null> {
        return this.callApi<AIAnalysis | null>(
            `/api/session/${sessionId}/image-frame`,
            'POST',
            { imageData, mimeType, vehicleContext, userId, inputTimestamp }
        );
    }

    async analyzeLiveAudioChunk(
        audioData: string, mimeType: string, vehicleContext: string,
        userId: string, sessionId: string, audioChunkDurationSeconds: number, inputTimestamp?: number
    ): Promise<AIAnalysis | null> {
        return this.callApi<AIAnalysis | null>(
            `/api/session/${sessionId}/audio-chunk`,
            'POST',
            { audioData, mimeType, vehicleContext, userId, audioChunkDurationSeconds, inputTimestamp }
        );
    }

    async generateReply(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: { inlineData?: { mimeType: string, data: string }, fileData?: { mimeType: string, fileUri: string } }[]
    ): Promise<string | MessagePart[]> {
        return this.callApi<string | MessagePart[]>(
            '/api/chat', // Main application's chat API endpoint
            'POST',
            { history, message, vehicleContext, diagnosticContext, userId, sessionId, reasoningEffort, additionalParts }
        );
    }

    // Optional: If the agent needs to verify hypotheses, implement this
    async verifyHypothesis?(): Promise<any> {
        throw new Error('Method not implemented on AiApiClient for LiveKit Agent.');
    }

    async countTokens(content: string | MessagePart[] | Part[]): Promise<number> {
        const response = await this.callApi<{ tokenCount: number }>(
            '/api/token-count',
            'POST',
            { content, modelType: 'live' }
        );
        return response.tokenCount;
    }
}