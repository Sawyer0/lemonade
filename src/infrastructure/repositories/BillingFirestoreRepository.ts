import { injectable, inject } from 'inversify';
import type { ILogger } from '@lemonade/core';
import { IBillingRepository, AIUsageRecord, AIUsageRecordSchema } from '@lemonade/core';
import { adminDb } from '@/infrastructure/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class BillingFirestoreRepository implements IBillingRepository {
    private readonly COLLECTION = 'ai_usage_logs';

    constructor(@inject(TYPES.Logger) private logger: ILogger) { }

    async recordUsage(usage: AIUsageRecord, traceId?: string): Promise<void> {
        try {
            const data = AIUsageRecordSchema.parse(usage);
            const dataWithTimestamp = {
                ...data,
                timestamp: data.timestamp || new Date(),
                ...(traceId ? { traceId } : {})
            };

            if (traceId) {
                this.logger.debug('Recording AI usage with traceId', { traceId, usage: dataWithTimestamp });
            }

            await adminDb.collection(this.COLLECTION).add(dataWithTimestamp);
            const userId = data.userId;
            if (userId) {
                const statsRef = adminDb.doc(`users/${userId}/usage/stats`);

                await statsRef.set({
                    totalInputTokens: FieldValue.increment(data.inputTokens),
                    totalOutputTokens: FieldValue.increment(data.outputTokens),
                    totalSearchQueries: FieldValue.increment(data.searchQueries || 0),
                    lastUpdated: new Date()
                }, { merge: true });
            }

            this.logger.debug('AI usage recorded successfully', { usage: dataWithTimestamp, traceId });
        } catch (error) {
            this.logger.error('Failed to record AI usage - Non-blocking (Billing Stats)', error, { usage, traceId });
        }
    }
}