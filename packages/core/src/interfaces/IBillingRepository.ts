import { AIUsageRecord } from '../types/models';

export interface IBillingRepository {
    recordUsage(usage: AIUsageRecord): Promise<void>;
}
