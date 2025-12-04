import { injectable } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { IChatAssistantAI } from '@/core/interfaces/IAIService';
import { AIAnalysis } from '@/core/types/models';
import { VOICE_PROMPTS } from '@/core/prompts/voice';

@injectable()
export class GeminiFlashAdapter implements IChatAssistantAI {
    private model: GenerativeModel;

    constructor(projectId: string) {
        const vertex = new VertexAI({ project: projectId, location: 'us-central1' });

        this.model = vertex.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    }

    async generateReply(
        history: { role: string; content: string }[],
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
        CONTEXT:
        Vehicle: ${vehicleContext}
        Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
        `;

        const result = await chat.sendMessage(contextPrompt);
        const text = result.response.candidates?.[0].content.parts[0].text;
        return text || "I didn't catch that.";
    }

    async processAudioCommand(audioData: Float32Array, vehicleContext: string): Promise<string> {
        // 1. Convert Float32Array to Base64 PCM (16-bit linear PCM)
        const buffer = this.float32To16BitPCM(audioData);
        const base64Audio = Buffer.from(buffer).toString('base64');

        const prompt = VOICE_PROMPTS.COMMAND_ANALYSIS(vehicleContext);

        const result = await this.model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'audio/wav', data: base64Audio } }
                ]
            }]
        });

        const text = result.response.candidates?.[0].content.parts[0].text;
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
