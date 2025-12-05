import { describe, it, expect } from 'vitest';
import { SAFETY_PROMPTS } from '../prompts/safety';

describe('Safety Prompts', () => {
    it('should contain critical trigger phrases', () => {
        expect(SAFETY_PROMPTS.TRIGGER_PHRASES).toContain('going under the car');
        expect(SAFETY_PROMPTS.TRIGGER_PHRASES).toContain('jacking up');
        expect(SAFETY_PROMPTS.TRIGGER_PHRASES).toContain('lifting the car');
    });

    it('should have a red zone warning', () => {
        expect(SAFETY_PROMPTS.RED_ZONE_WARNING).toBeDefined();
        expect(SAFETY_PROMPTS.RED_ZONE_WARNING).toContain('SAFETY ALERT');
        expect(SAFETY_PROMPTS.RED_ZONE_WARNING).toContain('jack stands');
    });

    it('should have a verification passed message', () => {
        expect(SAFETY_PROMPTS.VERIFICATION_PASSED).toBeDefined();
        expect(SAFETY_PROMPTS.VERIFICATION_PASSED).toContain('proper jack stand support');
    });
});
