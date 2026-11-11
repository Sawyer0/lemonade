import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import type { ShopSettings } from '../types/memory';
import { ShopSettingsSchema } from '../types/memory';

/** Shop settings policy (LM-31): business settings are set once by the owner; a tech may never write them. */
export function updateShopSettings(
    current: ShopSettings,
    update: { laborRateCents?: number; currency?: string; suppliers?: string[] },
    actorRole: 'owner' | 'tech',
    actorId: string,
    now: string,
): ShopSettings {
    if (actorRole !== 'owner') {
        throw new AppError(ErrorCode.FORBIDDEN, 'Only the shop owner may change shop settings.');
    }
    // The merged settings must still satisfy the schema: an owner passing a
    // negative rate or a short currency code gets a validation error, not a
    // ShopSettings value that fails its own schema.
    try {
        return ShopSettingsSchema.parse({
            ...current,
            laborRateCents: update.laborRateCents ?? current.laborRateCents,
            currency: update.currency ?? current.currency,
            suppliers: update.suppliers ?? current.suppliers,
            updatedAt: now,
            updatedBy: actorId,
        });
    } catch (error) {
        throw AppError.fromError(error);
    }
}
