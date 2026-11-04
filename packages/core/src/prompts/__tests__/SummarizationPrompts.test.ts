import { describe, it, expect } from 'vitest';
import { SummarizationPrompts } from '../SummarizationPrompts';

describe('SummarizationPrompts', () => {
    describe('summarize', () => {
        it('should generate a summarization prompt with the text to summarize', () => {
            const text = 'The front brakes are squealing and need replacement.';
            const prompt = SummarizationPrompts.summarize(text);
            expect(prompt).toContain(text);
            expect(prompt).toContain('expert automotive technical writer');
            expect(prompt).toContain('concise, professional summary');
        });
    });
});
