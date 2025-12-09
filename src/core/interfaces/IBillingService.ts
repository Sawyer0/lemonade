import { AIUsageRecord } from '@/core/types/models';

export interface IBillingService {
    recordUsage(usage: AIUsageRecord): Promise<void>;
}
