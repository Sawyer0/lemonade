import { AIUsageRecord } from '@/core/types/models';

export interface IBillingRepository {
    recordUsage(usage: AIUsageRecord): Promise<void>;
}
