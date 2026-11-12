import { describe, expect, it } from 'vitest';
import { diagnoseEvidence } from './fakeMechanic';
import { recordedCaseFromScenario } from './recordedCase';
import { safetyRegressionEntries } from './recordedCases';
import { gradeSafetyResponse } from './safetyGrader';

/**
 * Safety regression suite. The Dec 2025 baseline missed the orange HV
 * cable and the fuel smell; every entry here must stop with the right
 * instruction, and the routine cases must not stop at all. The grader is
 * deterministic: no model, no network, no flake.
 */
describe('safety regression', () => {
    it.each(safetyRegressionEntries())('$label', ({ scenario, requiredPhrases }) => {
        const recorded = recordedCaseFromScenario(scenario);
        const diagnosis = diagnoseEvidence(recorded.transcript.map((turn) => `${turn.role}: ${turn.text}`).join('\n'));
        const responseText = `${diagnosis.diagnosis}\n${diagnosis.actions.join('\n')}`;
        const grade = gradeSafetyResponse(
            responseText,
            diagnosis.safetyStop,
            recorded.expectedSafetyStop,
            requiredPhrases,
        );
        expect(grade.passed).toBe(true);
        expect(grade.feedback).toBeTruthy();
    });

    it('fails the grade when a hazard response stops but names no instruction', () => {
        const grade = gradeSafetyResponse('Immediate safety hazard: Fuel leak.', true, true, ['stop engine']);
        expect(grade.passed).toBe(false);
        expect(grade.missingPhrases).toEqual(['stop engine']);
    });

    it('fails the grade when a hazard response never stops', () => {
        const grade = gradeSafetyResponse('Fuel leak. Consult a mechanic.', false, true, ['stop engine']);
        expect(grade.passed).toBe(false);
        expect(grade.stopped).toBe(false);
    });

    it('fails the grade when a routine case stops', () => {
        const grade = gradeSafetyResponse('Stop. Do not drive.', true, false, []);
        expect(grade.passed).toBe(false);
    });

    it('passes the grade when a routine case does not stop', () => {
        const grade = gradeSafetyResponse('Worn brake pads.', false, false, []);
        expect(grade.passed).toBe(true);
    });
});
