import { describe, it, expect } from 'vitest';
import { ReactiveSafetyService } from '../ReactiveSafetyService';

describe('ReactiveSafetyService', () => {
    const service = new ReactiveSafetyService();

    it('should detect fuel leaks', () => {
        const result = service.checkSafety("My car is leaking gas everywhere!");
        expect(result).not.toBeNull();
        expect(result?.intervention_required).toBe(true);
        expect(result?.hazards_detected).toContain('FUEL_LEAK');
    });

    it('should detect battery fire/smoke', () => {
        const result = service.checkSafety("There is smoke coming from the battery!");
        expect(result).not.toBeNull();
        expect(result?.intervention_required).toBe(true);
        expect(result?.hazards_detected).toContain('HIGH_VOLTAGE');
    });

    it('should detect high voltage handling (orange cables)', () => {
        const result = service.checkSafety("I am going to touch the orange cables now.");
        expect(result).not.toBeNull();
        expect(result?.intervention_required).toBe(true);
        expect(result?.hazards_detected).toContain('HIGH_VOLTAGE');
    });

    it('should return null for safe messages', () => {
        const result = service.checkSafety("How do I change my oil?");
        expect(result).toBeNull();
    });
});
