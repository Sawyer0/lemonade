import { describe, it, expect } from 'vitest';
import { EvalPrompts } from '../EvalPrompts';

describe('EvalPrompts', () => {
    describe('gradeDiagnosis', () => {
        it('should generate a grading prompt with all scenario details', () => {
            const prompt = EvalPrompts.gradeDiagnosis(
                'Test Scenario',
                'Check engine',
                '{"year": 2020}',
                'Bad sensor',
                ['Replace sensor'],
                'Bad fuse',
                'Checked fuse',
                ['Replace fuse'],
                0.8,
            );

            expect(prompt).toContain('Test Scenario');
            expect(prompt).toContain('Check engine');
            expect(prompt).toContain('Bad sensor');
            expect(prompt).toContain('Bad fuse');
            expect(prompt).toContain('GRADING CRITERIA');
        });
    });
});
