import type { GenerationConfig, GenerativeModel } from '@google-cloud/vertexai';
import type { IContextCacheService, ILogger, VerificationRequest, VerificationResponse } from '@lemonade/core';
import { VerificationPrompts } from '@lemonade/core';
import { VERIFICATION_RESPONSE_SCHEMA } from './responseSchemas';

const CACHE_TTL_SECONDS = 3600;

/**
 * Fact-checks a diagnostic hypothesis against gathered evidence. Fails safe:
 * any error yields an inconclusive, unverified answer.
 */
export class GeminiHypothesisVerifier {
    constructor(
        private readonly model: GenerativeModel,
        private readonly cacheService: IContextCacheService,
        private readonly logger: ILogger,
    ) {}

    async verify(request: VerificationRequest, traceId?: string): Promise<VerificationResponse> {
        this.logger.debug('Verifying Hypothesis with Flash', { hypothesis: request.hypothesis, traceId });

        const cacheKey = `verifyHypothesis-${JSON.stringify(request)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for verifyHypothesis', { cacheKey, traceId });
            return existingCache as VerificationResponse;
        }

        const apiRequest = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: VerificationPrompts.factChecker(request.hypothesis, request.evidence) }],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: VERIFICATION_RESPONSE_SCHEMA,
            } as unknown as GenerationConfig,
        };

        try {
            const result = await this.model.generateContent(apiRequest);
            const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) throw new Error('Empty verification response');

            const parsed = JSON.parse(text) as Partial<VerificationResponse>;
            const response: VerificationResponse = {
                isVerified: !!parsed.isVerified,
                source: parsed.source || null,
                reasoning: parsed.reasoning || 'No reasoning provided.',
            };
            await this.cacheService.createCache([{ text: JSON.stringify(response) }], CACHE_TTL_SECONDS, cacheKey);
            return response;
        } catch (error) {
            this.logger.error('Verification Logic Failed', error, { traceId });
            return { isVerified: false, source: null, reasoning: 'Verification failed due to internal error.' };
        }
    }
}
