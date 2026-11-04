import type { AiGenerationConfig, ReasoningEffort } from '@lemonade/core';
import { AI_GENERATION_CONFIGS } from '@lemonade/core';

/** Maps a caller's reasoning effort onto the thinking budget and temperature to use. */
export function generationConfigForEffort(effort?: ReasoningEffort): AiGenerationConfig {
    switch (effort) {
        case 'none':
            return {
                thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
                temperature: 0.1,
                responseMimeType: 'text/plain',
            };
        case 'moderate':
            return AI_GENERATION_CONFIGS.CHAT_MODERATE;
        case 'high':
            return AI_GENERATION_CONFIGS.CHAT_HIGH;
        default:
            return AI_GENERATION_CONFIGS.CHAT_BOT;
    }
}
