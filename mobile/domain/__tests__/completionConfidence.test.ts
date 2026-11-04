import { completionConfidence } from '../completionConfidence';

const token = (content: string, prob: number) => ({ content, probs: [{ tok_str: content, prob }] });

describe('completionConfidence', () => {
    it('is undefined without probabilities', () => {
        expect(completionConfidence(undefined)).toBeUndefined();
        expect(completionConfidence([])).toBeUndefined();
    });

    it('is the geometric mean of emitted token probabilities', () => {
        expect(completionConfidence([token('{', 1), token('ok', 0.25)])).toBeCloseTo(0.5);
    });

    it('uses the probability of the emitted token, not the top alternative', () => {
        const sampled = {
            content: 'CAUTION',
            probs: [
                { tok_str: 'NORMAL', prob: 0.9 },
                { tok_str: 'CAUTION', prob: 0.1 },
            ],
        };
        expect(completionConfidence([sampled])).toBeCloseTo(0.1);
    });

    it('drops to zero when any emitted token had zero probability', () => {
        expect(completionConfidence([token('a', 0.9), token('b', 0)])).toBe(0);
    });
});
