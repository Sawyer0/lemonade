import { describe, it, expect } from 'vitest';
import { VerificationPrompts } from '../VerificationPrompts';

describe('VerificationPrompts', () => {
    describe('factChecker', () => {
        it('should generate a fact checker prompt with hypothesis and evidence', () => {
            const hypothesis = 'Bad battery';
            const evidence = 'Voltage is 10V';
            const prompt = VerificationPrompts.factChecker(hypothesis, evidence);
            expect(prompt).toContain(hypothesis);
            expect(prompt).toContain(evidence);
            expect(prompt).toContain('Scientific Fact Checker');
        });
    });
});
