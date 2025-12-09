import { injectable, inject } from 'inversify';
import type { IBillingService } from '@/core/interfaces/IBillingService';
import type { IBillingRepository } from '@/core/interfaces/IBillingRepository';
import { AIUsageRecord } from '@/core/types/models';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class BillingService implements IBillingService {
    constructor(@inject(TYPES.BillingRepository) private billingRepo: IBillingRepository) { }

    async recordUsage(usage: AIUsageRecord): Promise<void> {
        await this.billingRepo.recordUsage(usage);
    }
}
