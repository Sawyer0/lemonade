import { injectable, inject } from 'inversify';
import { IBillingService, IBillingRepository, AIUsageRecord } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class BillingService implements IBillingService {
    constructor(@inject(TYPES.BillingRepository) private billingRepo: IBillingRepository) { }

    async recordUsage(usage: AIUsageRecord): Promise<void> {
        await this.billingRepo.recordUsage(usage);
    }
}
