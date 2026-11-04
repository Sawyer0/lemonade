import { injectable, inject } from 'inversify';
import type { ISafetyAI, ILogger } from '@lemonade/core';
import { ISafetyMonitor, SafetyPrompts, SafetyAssessment } from '@lemonade/core';
import { TYPES } from '../di/types';

/**
 * Returned whenever the safety model cannot give a usable answer. The check fails
 * closed: maximum danger on the 1-10 scale and an intervention required.
 */
const FAIL_CLOSED_ASSESSMENT: SafetyAssessment = {
    safety_score: 10,
    hazards_detected: ['SAFETY_CHECK_FAILED'],
    user_intent: 'unknown',
    intervention_required: true,
};

@injectable()
export class SafetyMonitor implements ISafetyMonitor {
    constructor(
        @inject(TYPES.SafetyAI) private safetyAI: ISafetyAI,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    async assess(userMessage: string, context: string): Promise<SafetyAssessment> {
        this.logger.info('Assessing safety', { userMessage, contextSnippet: context.substring(0, 50) });

        const prompt = SafetyPrompts.safetyAssessment(userMessage, context);

        try {
            const text = await this.safetyAI.assessSafety(prompt);

            if (!text) {
                this.logger.warn('SafetyMonitor: No response text received', { userMessage });
                return { ...FAIL_CLOSED_ASSESSMENT };
            }

            const cleanText = text.replace(/```json\n?|\n?```/g, '');

            try {
                const assessment = JSON.parse(cleanText) as SafetyAssessment;
                this.logger.info('Safety assessment complete', { assessment });
                return assessment;
            } catch (e) {
                this.logger.warn(`SafetyMonitor: Failed to parse JSON response: ${cleanText}`, {
                    error: e,
                    userMessage,
                });
                return { ...FAIL_CLOSED_ASSESSMENT };
            }
        } catch (error) {
            this.logger.error('SafetyMonitor Assessment Failed', error as Error, { userMessage });
            return { ...FAIL_CLOSED_ASSESSMENT };
        }
    }
}
