import { describe, expect, it } from 'vitest';
import { diagnoseEvidence, matchingRules, nearMissRules } from './fakeMechanic';

describe('matchingRules', () => {
    it('returns every rule the complaint is consistent with, in rule order', () => {
        expect(matchingRules('There is a strong gasoline smell and a puddle under the car.').map((rule) => rule.id)).toEqual([
            'fuel-leak',
        ]);
        expect(matchingRules('The brakes squeal every time I stop.').map((rule) => rule.id)).toEqual(['brake-pads']);
        expect(matchingRules('The car shakes violently when I hit a bump.').map((rule) => rule.id)).toEqual([
            'death-wobble',
        ]);
    });

    it('returns nothing the complaint matches nothing', () => {
        expect(matchingRules('The radio preset keeps resetting.')).toEqual([]);
    });
});

describe('nearMissRules', () => {
    it('keeps confusables that share a keyword without matching', () => {
        const near = nearMissRules('The brakes squeal every time I stop.').map((rule) => rule.id);
        expect(near).toContain('brake-fluid');
        expect(near).not.toContain('brake-pads');
    });

    it('returns nothing when no other rule shares a keyword', () => {
        expect(nearMissRules('There is a strong gasoline smell and a puddle under the car.')).toEqual([]);
    });
});

describe('diagnoseEvidence', () => {
    it('still returns the first matching rule after the refactor', () => {
        expect(diagnoseEvidence('There is a strong gasoline smell and a puddle under the car.').ruleId).toBe(
            'fuel-leak',
        );
        expect(diagnoseEvidence('The radio preset keeps resetting.').ruleId).toBe('uncertain');
    });
});
