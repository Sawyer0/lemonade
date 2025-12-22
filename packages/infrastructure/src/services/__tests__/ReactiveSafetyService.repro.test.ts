import { ReactiveSafetyService } from '../ReactiveSafetyService';

describe('ReactiveSafetyService Reproduction', () => {
    let service: ReactiveSafetyService;

    beforeEach(() => {
        service = new ReactiveSafetyService();
    });

    it('should catch "gasoline smell" (Environmental Hazard - Always Trigger)', () => {
        const input = "I have a strong gasoline smell coming from the engine.";
        const result = service.checkSafety(input);
        expect(result).not.toBeNull();
        expect(result?.hazards_detected).toContain('FUEL_LEAK');
    });

    it('should catch "yank orange cable" (Unknown Verb - Inverted Logic)', () => {
        // "Yank" is not in a safe-list, so it should trigger high voltage warning
        const input = "I need to yank that orange cable out.";
        const result = service.checkSafety(input);
        expect(result).not.toBeNull();
        expect(result?.hazards_detected).toContain('HIGH_VOLTAGE');
    });

    it('should ALLOW "seeing orange cable" (Safe Observation)', () => {
        // "See" is a safe verb, so this should NOT trigger (result should be null)
        const input = "I see an orange cable near the battery.";
        const result = service.checkSafety(input);
        expect(result).toBeNull();
    });
});
