import { describe, it, expect } from 'vitest';
import { SemanticTriageResultSchema } from '../localPerception';

describe('SemanticTriageResultSchema', () => {
    it('validates a correct lean JSON object', () => {
        const validData = {
            id: {
                obj: 'Brake Rotor',
                cat: 'Braking',
            },
            eval: {
                stat: 'CRITICAL',
                risk: true,
                note: 'Deep surface rust visible',
            },
        };
        const result = SemanticTriageResultSchema.safeParse(validData);
        expect(result.success).toBe(true);
    });

    it('rejects invalid enum values', () => {
        const invalidData = {
            id: {
                obj: 'Brake Rotor',
                cat: 'Braking',
            },
            eval: {
                stat: 'INVALID_STATUS', // Should be NORMAL | CAUTION | CRITICAL | UNCERTAIN
                risk: true,
                note: 'Deep surface rust visible',
            },
        };
        const result = SemanticTriageResultSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });
});
