import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import {
    IChatAssistantAI,
    ISummarizationService,
    ILogger,
    SUMMARIZATION_PROMPT
} from '@lemonade/core';

@injectable()
export class SummarizationService implements ISummarizationService {
    constructor(
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.Logger) private logger: ILogger,
    ) { }

    async summarize(text: string): Promise<string> {
        this.logger.debug('Summarizing text', { textLength: text.length });

        try {
            const prompt = SUMMARIZATION_PROMPT.replace('{text}', text);

            const summary = await this.chatAI.generateReply(
                [],
                prompt,
                '',
                null,
                'system',
                'system-summarization'
            );

            if (typeof summary === 'string') {
                return summary;
            } else if (Array.isArray(summary)) {
                const textPart = summary.find((p: any) => p.type === 'text' && p.text);
                return textPart ? (textPart.text || '') : '';
            }
            else {
                this.logger.warn('Summarization AI returned unexpected type', { summary });
                return text;
            }
        } catch (error) {
            this.logger.error('Failed to summarize text using AI', error);
            return text;
        }
    }
}
