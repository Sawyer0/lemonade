/**
 * Utility for standardizing Supermemory container tags for isolation.
 */
export const MemoryTags = {
    user: (userId: string) => `user:${userId}`,
    vin: (vin: string) => `vin:${vin.toUpperCase()}`,
    /** Shop scope (LM-31): the shop holds the vehicle record. */
    shop: (shopId: string) => `shop:${shopId}`,
    status: (status: 'verified' | 'session' | 'complaint') => `status:${status}`,
    type: (type: 'diagnostic' | 'manual' | 'observation') => `type:${type}`,

    /**
     * Creates a standard isolation set for a vehicle context.
     */
    forVehicle: (userId: string, vin: string) => [MemoryTags.user(userId), MemoryTags.vin(vin)],

    /**
     * Creates a standard isolation set for a vehicle record held by a shop.
     * The same VIN at another shop resolves to a different record.
     */
    forVehicleAtShop: (shopId: string, vin: string) => [MemoryTags.shop(shopId), MemoryTags.vin(vin)],

    /**
     * Parses a tag string back into its parts.
     */
    parse: (tag: string): { key: string; value: string } | null => {
        const parts = tag.split(':');
        if (parts.length < 2) return null;
        return {
            key: parts[0],
            value: parts.slice(1).join(':'),
        };
    },
};
