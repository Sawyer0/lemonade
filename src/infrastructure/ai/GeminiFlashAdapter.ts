import { injectable } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { IChatAssistantAI } from '@/core/interfaces/IAIService';
import { AIAnalysis } from '@/core/types/models';
import { SYSTEM_PROMPTS } from '@/core/constants/prompts';

@injectable()
export class GeminiFlashAdapter implements IChatAssistantAI {
    private model: GenerativeModel;

    constructor(projectId: string) {
        const vertex = new VertexAI({ project: projectId, location: 'us-central1' });

        this.model = vertex.getGenerativeModel({ model: 'gemini-1.5-flash-001' });
    }

    async generateReply(
        history: { role: string; content: string }[],
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null
    ): Promise<string> {

        const systemPrompt = SYSTEM_PROMPTS.CHAT_CONTEXT(vehicleContext, diagnosticContext ? JSON.stringify(diagnosticContext) : null);

        const chat = this.model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                ...history.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }))
            ]
        });

        const result = await chat.sendMessage("Continue conversation based on last user input.");
        return result.response.candidates?.[0].content.parts[0].text || "I'm having trouble connecting.";
    }
}
