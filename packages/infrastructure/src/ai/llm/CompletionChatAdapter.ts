import {
    SafetyPrompts,
    SystemPrompts,
    VerificationPrompts,
    VerificationResponseSchema,
    type AIAnalysis,
    type IChatAssistantAI,
    type MessagePart,
    type StreamingEvent,
    type VerificationRequest,
    type VerificationResponse,
} from '@lemonade/core';
import type { ChatCompletionClient, ChatCompletionMessage } from './ChatCompletionClient';

type HistoryEntry = { role: string; content?: unknown };

/** Rough English-text estimate (~4 characters per token) used for history pruning. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Text chat assistant backed by any ChatCompletionClient (Groq by default).
 * Supports chat, streaming and hypothesis verification. Attached media and
 * Gemini function calling are Vertex-only, so file parts are ignored here.
 */
export class CompletionChatAdapter implements IChatAssistantAI {
    constructor(private readonly client: ChatCompletionClient) {}

    async generateReply(
        history: HistoryEntry[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
    ): Promise<string> {
        return this.client.complete({
            messages: this.buildMessages(history, message, vehicleContext, diagnosticContext),
            temperature: 0.4,
        });
    }

    async *generateReplyStream(
        history: HistoryEntry[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
    ): AsyncGenerator<StreamingEvent, void, unknown> {
        const messages = this.buildMessages(history, message, vehicleContext, diagnosticContext);
        for await (const delta of this.client.stream({ messages, temperature: 0.4 })) {
            yield { type: 'text', content: delta };
        }
        yield { type: 'done' };
    }

    async verifyHypothesis(request: VerificationRequest): Promise<VerificationResponse> {
        const raw = await this.client.complete({
            messages: [
                { role: 'user', content: VerificationPrompts.factChecker(request.hypothesis, request.evidence) },
            ],
            temperature: 0,
            jsonMode: true,
        });
        const parsed = VerificationResponseSchema.safeParse(parseJsonObject(raw));
        if (parsed.success) return parsed.data;
        return { isVerified: false, source: null, reasoning: 'Verification response could not be parsed.' };
    }

    async countTokens(content: string): Promise<number> {
        return estimateTokens(content);
    }

    private buildMessages(
        history: HistoryEntry[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
    ): ChatCompletionMessage[] {
        const system = [
            SystemPrompts.identity(),
            SystemPrompts.primeDirectives(),
            `CONTEXT:\nVehicle: ${vehicleContext.trim()}\nCurrent Diagnosis: ${
                diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'
            }`,
            SafetyPrompts.masterTechInstruction(),
        ].join('\n\n');

        return [
            { role: 'system', content: system },
            ...history.map(toCompletionMessage).filter((m) => m.content.length > 0),
            { role: 'user', content: message },
        ];
    }
}

function toCompletionMessage(entry: HistoryEntry): ChatCompletionMessage {
    const role =
        entry.role === 'assistant' || entry.role === 'model'
            ? 'assistant'
            : entry.role === 'system'
              ? 'system'
              : 'user';
    return { role, content: historyText(entry.content) };
}

function historyText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return (content as MessagePart[])
            .filter((part) => part.type === 'text' && part.text)
            .map((part) => part.text)
            .join('\n');
    }
    return '';
}

/** Parses a JSON object even when the model wraps it in a Markdown code fence. */
export function parseJsonObject(raw: string): unknown {
    const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return undefined;
    }
}
