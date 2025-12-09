import { injectable, inject } from 'inversify';
import type { IBillingRepository } from '@/core/interfaces/IBillingRepository';
import { AIUsageRecord, AIUsageRecordSchema } from '@/core/types/models';
import { adminDb } from '@/infrastructure/firebase/admin';
import type { ILogger } from '@/core/interfaces/ILogger';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class BillingFirestoreRepository implements IBillingRepository {
    constructor(@inject(TYPES.Logger) private logger: ILogger) { }

    async recordUsage(usage: AIUsageRecord): Promise<void> {
        try {
            AIUsageRecordSchema.parse(usage); // Validate before writing
            await adminDb.collection('ai_usage_logs').add({
                ...usage,
                timestamp: usage.timestamp || new Date() // Ensure timestamp is present and a Date object
            });
            this.logger.debug('AI usage recorded successfully', { usage });
        } catch (error) {
            this.logger.error('Failed to record AI usage', error, { usage });
            // Depending on criticality, re-throw or handle silently
        }
    }
}
