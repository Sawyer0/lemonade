import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { ILogger } from '@/core/interfaces/ILogger';
import { IBillingService } from '@/core/interfaces/IBillingService';
import { TYPES } from '@/infrastructure/di/types';
import { CONFIG } from '@/infrastructure/config';
import { ReasoningEffort } from '@/core/types/ai';

export async function processVoiceCommand(
    model: GenerativeModel,
    audioData: Buffer,
    mimeType: string, // REFACTORED: Dynamic Mime Type for Mobile/iOS
    vehicleContext: string,
    logger: ILogger,
    userId: string,
    sessionId: string,
    billingService: IBillingService,
    reasoningEffort?: ReasoningEffort
): Promise<string> {
    try {
        logger.info('[VoiceProcessor] Processing audio command...', { size: audioData.length, mimeType });

        // 1. Send Audio + Context to Multimodal Gemini
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    {
                        text: `
                        CONTEXT: You are a mechanic's assistant.
                        VEHICLE: ${vehicleContext}
                        
                        INSTRUCTION: Listen to the mechanic. 
                        - If they are asking a question, answer it concisely.
                        - If they are just talking to themselves (e.g., swearing, grunting), ignore it and output "NO_RESPONSE".
                        - If they ask for visual help, output "TOOL:OPEN_CAMERA".
                        `
                    },
                    {
                        inlineData: {
                            // Mobile Compatibility: We trust the client's mimeType (e.g., audio/mp4, audio/x-m4a, audio/webm)
                            mimeType: mimeType,
                            data: audioData.toString('base64')
                        }
                    }
                ]
            }]
        });

        const text = result.response.candidates?.[0].content.parts[0].text || "I didn't catch that.";

        // 2. Billing
        if (result.response.usageMetadata) {
            await billingService.recordUsage({
                userId,
                sessionId,
                inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                model: 'gemini-2.5-flash-audio',
                timestamp: new Date()
            });
        }

        return text;

    } catch (error) {
        logger.error('[VoiceProcessor] Failed', error);
        return "Voice system error.";
    }
}
