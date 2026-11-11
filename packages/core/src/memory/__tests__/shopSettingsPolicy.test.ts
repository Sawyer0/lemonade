import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import { updateShopSettings } from '../shopSettingsPolicy';

const SHOP = 'shop-1';
const NOW = '2026-11-11T10:00:00.000Z';

function settings() {
    return {
        shopId: SHOP,
        laborRateCents: 12000,
        currency: 'USD',
        suppliers: ['PartsCo'],
        updatedAt: NOW,
        updatedBy: 'owner-1',
    };
}

describe('updateShopSettings', () => {
    it('lets the owner change business settings', () => {
        const next = updateShopSettings(settings(), { laborRateCents: 14000 }, 'owner', 'owner-1', NOW);
        expect(next.laborRateCents).toBe(14000);
        expect(next.updatedBy).toBe('owner-1');
    });

    it('refuses a tech changing business settings', () => {
        try {
            updateShopSettings(settings(), { laborRateCents: 14000 }, 'tech', 'tech-1', NOW);
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.FORBIDDEN);
            return;
        }
        expect.unreachable('Expected the call to throw an AppError.');
    });
});
