import type { UsageMetadata } from '@google-cloud/vertexai';
import type { IBillingService } from '@lemonade/core';
import { CONFIG } from '../../config';

/** Bills one Gemini chat-model call to the user's session. */
export async function recordChatModelUsage(
    billingService: IBillingService,
    usage: UsageMetadata,
    userId: string,
    sessionId: string,
    traceId?: string,
): Promise<void> {
    await billingService.recordUsage(
        {
            userId,
            sessionId,
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            model: CONFIG.AI_MODELS.CHAT_MODEL,
            timestamp: new Date(),
        },
        traceId,
    );
}
