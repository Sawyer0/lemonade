/**
 * ReactiveSafetyService.expanded.test.ts
 * 
 * Tests for Phase 1: Expanded safety rules (generated + hardcoded)
 */

import { describe, it, expect } from 'vitest';
import { ReactiveSafetyService } from '../ReactiveSafetyService';

describe('ReactiveSafetyService - Expanded Rules (Phase 1)', () => {
    const service = new ReactiveSafetyService();

    describe('Rule Count Verification', () => {
        it('should have expanded rule counts', () => {
            const counts = service.getRuleCounts();
            // 2 hardcoded env + 15 generated env = 17
            // 2 hardcoded int + 12 generated int = 14
            expect(counts.environmental).toBeGreaterThanOrEqual(15);
            expect(counts.interaction).toBeGreaterThanOrEqual(12);
            expect(counts.totalRules).toBeGreaterThanOrEqual(25);
        });
    });

    describe('Hardcoded Environmental Triggers', () => {
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
    });

    describe('Generated Environmental Triggers (Phase 1)', () => {
        it('should detect carbon monoxide risks', () => {
            const result = service.checkSafety("The car is running in the garage with the door closed");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('CARBON_MONOXIDE');
        });

        it('should detect airbag deployment', () => {
            const result = service.checkSafety("The airbag deployed and there is powder everywhere");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('AIRBAG_DEPLOYMENT');
        });

        it('should detect brake failure', () => {
            const result = service.checkSafety("I have no brakes, the pedal goes to the floor");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('BRAKE_FAILURE');
        });

        it.skip('should detect coolant leaks (requires regenerating rules)', () => {
            // TODO: Regenerate rules with COOLANT_LEAK pattern
            const result = service.checkSafety("There is antifreeze leaking under my car");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('COOLANT_LEAK');
        });

        it('should detect battery acid hazards', () => {
            const result = service.checkSafety("There is acid spilling from the corroded battery");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('BATTERY_ACID');
        });

        it('should detect electrical shorts', () => {
            const result = service.checkSafety("The wire is sparking and there is burnt wire smell");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('ELECTRICAL_SHORT');
        });

        it('should detect vehicle instability', () => {
            const result = service.checkSafety("The car fell off the jack");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('UNSTABLE_VEHICLE');
        });
    });

    describe('Hardcoded Interaction Hazards', () => {
        it('should detect high voltage handling (orange cables) without safe verb', () => {
            const result = service.checkSafety("I am going to touch the orange cables now.");
            expect(result).not.toBeNull();
            expect(result?.intervention_required).toBe(true);
            expect(result?.hazards_detected).toContain('HIGH_VOLTAGE');
        });

        it('should allow observation of orange cables with safe verb', () => {
            const result = service.checkSafety("I am looking at the orange cables.");
            expect(result).toBeNull(); // Safe verb present
        });

        it('should detect going under vehicle without safe verb', () => {
            const result = service.checkSafety("I need to get under the car to fix this.");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('JACK_STAND_MISSING');
        });
    });

    describe('Generated Interaction Hazards (Phase 1)', () => {
        it('should warn about hot exhaust manifold without safe verb', () => {
            const result = service.checkSafety("I want to replace the exhaust manifold");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('HOT_SURFACES');
        });

        it('should allow inspecting exhaust manifold with safe verb', () => {
            const result = service.checkSafety("I am inspecting the exhaust manifold for cracks");
            expect(result).toBeNull(); // Safe verb "inspecting"
        });

        it('should warn about serpentine belt without safe verb', () => {
            const result = service.checkSafety("I need to replace the serpentine belt");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('ROTATING_PARTS');
        });

        it('should warn about cooling fan without safe verb', () => {
            const result = service.checkSafety("The radiator fan is making noise, going to fix it");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('ROTATING_PARTS');
        });

        it('should warn about AC lines without safe verb', () => {
            const result = service.checkSafety("I need to disconnect the ac lines");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('PRESSURIZED_SYSTEM');
        });

        it('should warn about radiator cap when hot without safe verb', () => {
            const result = service.checkSafety("I want to open the radiator cap");
            expect(result).not.toBeNull();
            expect(result?.hazards_detected).toContain('HOT_SURFACES');
        });
    });

    describe('Safe Verb Whitelist (Expanded)', () => {
        const safeVerbs = [
            'see', 'look', 'looking', 'inspect', 'inspecting', 'check', 'checking',
            'scan', 'scanning', 'observe', 'notice', 'find', 'examine', 'test', 'testing'
        ];

        it.each(safeVerbs)('should allow observation with safe verb: "%s"', (verb) => {
            const result = service.checkSafety(`I am ${verb} the orange cables`);
            expect(result).toBeNull();
        });
    });

    describe('Safe Messages', () => {
        const safeQueries = [
            "How do I change my oil?",
            "What is the recommended tire pressure?",
            "Where is the cabin filter located?",
            "My check engine light is on",
            "The car makes a clicking sound when I turn the key"
        ];

        it.each(safeQueries)('should return null for safe message: "%s"', (query) => {
            const result = service.checkSafety(query);
            expect(result).toBeNull();
        });
    });
});
