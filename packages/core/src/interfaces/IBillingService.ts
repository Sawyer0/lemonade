import { AIUsageRecord } from '../types/models';

export interface IBillingService {
    recordUsage(usage: AIUsageRecord, traceId?: string): Promise<void>;
}
