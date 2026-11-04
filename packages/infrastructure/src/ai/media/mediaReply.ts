import type { AIAnalysis, IBillingService, MediaAnalysisResult, MessagePart } from '@lemonade/core';
import { AIAnalysisSchema, AppError, ErrorCode } from '@lemonade/core';
import { newToolCallId } from '../toolCallId';

/** Bills a media analysis to the session when the provider reported usage. */
export async function billMediaUsage(
    billingService: IBillingService,
    result: MediaAnalysisResult,
    userId: string,
    sessionId: string,
): Promise<void> {
    if (!result.usage) return;
    await billingService.recordUsage({
        userId,
        sessionId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        model: result.model,
        timestamp: new Date(),
    });
}

/** The tool calls (with any accompanying text) to hand to the client, or null when there are none. */
export function toolCallParts(result: MediaAnalysisResult): MessagePart[] | null {
    if (result.toolCalls.length === 0) return null;

    const parts: MessagePart[] = [];
    if (result.text) parts.push({ type: 'text', text: result.text });
    for (const call of result.toolCalls) {
        parts.push({ type: 'tool-call', toolName: call.name, toolCallId: newToolCallId(), args: call.args });
    }
    return parts;
}

/** Parses a structured reply into an AIAnalysis, failing loudly on an empty one. */
export function parseAnalysis(result: MediaAnalysisResult, emptyMessage: string): AIAnalysis {
    if (!result.text) throw new AppError(ErrorCode.AI_SERVICE_ERROR, emptyMessage);
    return AIAnalysisSchema.parse(JSON.parse(result.text));
}
