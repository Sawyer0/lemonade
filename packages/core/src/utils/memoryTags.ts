/**
 * Utility for standardizing Supermemory container tags for isolation.
 */
export const MemoryTags = {
    user: (userId: string) => `user:${userId}`,
    vin: (vin: string) => `vin:${vin.toUpperCase()}`,
    status: (status: 'verified' | 'session' | 'complaint') => `status:${status}`,
    type: (type: 'diagnostic' | 'manual' | 'observation') => `type:${type}`,

    /**
     * Creates a standard isolation set for a vehicle context.
     */
    forVehicle: (userId: string, vin: string) => [
        MemoryTags.user(userId),
        MemoryTags.vin(vin)
    ],

    /**
     * Parses a tag string back into its parts.
     */
    parse: (tag: string): { key: string; value: string } | null => {
        const parts = tag.split(':');
        if (parts.length < 2) return null;
        return {
            key: parts[0],
            value: parts.slice(1).join(':')
        };
    }
};
