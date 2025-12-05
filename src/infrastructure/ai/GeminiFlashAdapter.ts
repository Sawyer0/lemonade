import { injectable } from 'inversify';
import { VertexAI, GenerativeModel, Tool } from '@google-cloud/vertexai';
import { IChatAssistantAI } from '@/core/interfaces/IAIService';
import { AIAnalysis } from '@/core/entities/DiagnosticSession';
import { VOICE_PROMPTS } from '@/core/prompts/voice';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';
import { SAFETY_PROMPTS } from '@/core/prompts/safety';
import { VERIFY_SAFE_SUPPORT_TOOL } from '@/core/tools/verifySafeSupport';
import { CONFIG } from '@/infrastructure/config';

@injectable()
export class GeminiFlashAdapter implements IChatAssistantAI {
    private model: GenerativeModel;
    private safetyTools: Tool[];

    constructor(projectId: string) {
        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!key) {
            console.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY is missing in GeminiFlashAdapter');
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing');
        }
        console.log('DEBUG: GeminiFlashAdapter Key present, length:', key.length);
        const credentials = JSON.parse(key);
        console.log('DEBUG: Service Account Email:', credentials.client_email);

        const authOptions = { credentials };

        const vertex = new VertexAI({
            project: projectId,
            location: 'us-central1',
            googleAuthOptions: authOptions
        });

        // Define tools for function calling (Safety 2.0)
        this.safetyTools = [{
            functionDeclarations: [VERIFY_SAFE_SUPPORT_TOOL]
        }];

        this.model = vertex.getGenerativeModel({
            model: CONFIG.AI_MODELS.PRIMARY,
            tools: this.safetyTools
        });
    }

    async generateReply(
        history: { role: string; content: string }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null
    ): Promise<string> {
        const chat = this.model.startChat({
            history: history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }))
        });

        const contextPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        CONTEXT:
        Vehicle: ${vehicleContext}
        Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
        
        SAFETY TRIGGERS: If the user mentions any of: ${SAFETY_PROMPTS.TRIGGER_PHRASES.join(', ')},
        you MUST use the verifySafeSupport tool to request visual verification before proceeding.
        `;

        const fullPrompt = `
        ${contextPrompt}

        USER MESSAGE:
        ${message}
        `;

        const result = await chat.sendMessage(fullPrompt);

        // Check if the model wants to call a function (Safety 2.0)
        const response = result.response;
        const candidate = response.candidates?.[0];

        if (candidate?.content?.parts?.length && candidate.content.parts[0].functionCall) {
            const functionCall = candidate.content.parts[0].functionCall;

            if (functionCall.name === 'verifySafeSupport') {
                // Return a safety verification request message
                return `🛡️ **Safety Verification Required**\n\n${SAFETY_PROMPTS.RED_ZONE_WARNING}`;
            }
        }

        const text = candidate?.content.parts[0].text;
        return text || "I didn't catch that.";
    }

    async processAudioCommand(audioData: Float32Array, vehicleContext: string): Promise<string> {
        // 1. Convert Float32Array to Base64 PCM (16-bit linear PCM)
        const buffer = this.float32To16BitPCM(audioData);
        const base64Audio = Buffer.from(buffer).toString('base64');

        const prompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}
        
        SAFETY TRIGGERS: If the user's speech mentions any of: ${SAFETY_PROMPTS.TRIGGER_PHRASES.join(', ')},
        you MUST use the verifySafeSupport tool to request visual verification.
        
        ${VOICE_PROMPTS.COMMAND_ANALYSIS(vehicleContext)}
        `;

        const result = await this.model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'audio/wav', data: base64Audio } }
                ]
            }]
        });

        // Check for function call in voice response too
        const candidate = result.response.candidates?.[0];

        if (candidate?.content?.parts?.length && candidate.content.parts[0].functionCall) {
            const functionCall = candidate.content.parts[0].functionCall;

            if (functionCall.name === 'verifySafeSupport') {
                return `🛡️ **Safety Verification Required**\n\n${SAFETY_PROMPTS.RED_ZONE_WARNING}`;
            }
        }

        const text = candidate?.content.parts[0].text;
        return text || "I couldn't hear you clearly.";
    }

    private float32To16BitPCM(float32Arr: Float32Array): ArrayBuffer {
        const buffer = new ArrayBuffer(float32Arr.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Arr.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Arr[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(i * 2, s, true);
        }
        return buffer;
    }
}
