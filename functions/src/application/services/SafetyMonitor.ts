import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types';
import { SafetyAssessment, SafetyPrompts, ILogger, ISafetyMonitor, ISafetyAI } from '@lemonade/core';

@injectable()
export class SafetyMonitor implements ISafetyMonitor {
    constructor(
        @inject(TYPES.SafetyAI) private safetyAI: ISafetyAI,
        @inject(TYPES.Logger) private logger: ILogger, // Inject Logger
    ) {}

    async assess(userMessage: string, context: string, traceId?: string): Promise<SafetyAssessment> {
        // Added traceId
        try {
            const prompt = SafetyPrompts.safetyAssessment(userMessage, context);

            this.logger.debug('Assessing safety with AI', { promptSnippet: prompt.substring(0, 100), traceId }); // Use logger

            const text = await this.safetyAI.assessSafety(prompt);

            if (!text) {
                this.logger.warn('SafetyMonitor: No response text received', { userMessage, traceId });
                throw new Error('Empty Safety Response');
            }

            let cleanText = text.trim();
            cleanText = cleanText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/\s*```$/, '');

            return JSON.parse(cleanText) as SafetyAssessment;
        } catch (error) {
            this.logger.error('SafetyMonitor Assessment Failed', error, { userMessage, traceId }); // Use logger
            // Fail closed: block operation when safety check fails
            return {
                safety_score: 10,
                hazards_detected: ['SAFETY_CHECK_FAILED'],
                user_intent: 'Unable to assess safety due to system error',
                intervention_required: true,
            };
        }
    }
}
