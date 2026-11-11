import type { ExpectedValue, TestDefinition, TestStep } from './testSchema';

// --- Spoken step rendering (LM-34) ---
// Each step script renders to plain sentences the voice agent speaks to the
// tech, in the JPRO/WrenchLane shape techs trust: where to go, what to
// connect, what to expect, and what each answer means. Rendering is pure and
// deterministic, so snapshot tests pin the exact spoken words.

function asSentence(fragment: string): string {
    const trimmed = fragment.trim();
    if (trimmed.length === 0) {
        return '';
    }
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return capitalized.endsWith('.') || capitalized.endsWith('?') ? capitalized : `${capitalized}.`;
}

export function renderExpectedSpoken(expected: ExpectedValue): string {
    switch (expected.kind) {
        case 'value':
            return `${expected.value} ${expected.unit}`;
        case 'range':
            return `between ${expected.min} and ${expected.max} ${expected.unit}`;
        case 'text':
            return expected.text;
    }
}

/** One spoken line for one step, including the yes/no meaning of the outcome. */
export function renderStepSpoken(step: TestStep, stepNumber: number, totalSteps: number): string {
    const parts: string[] = [
        asSentence(`step ${stepNumber} of ${totalSteps}`),
        asSentence(`at ${step.location}, ${step.instruction}`),
    ];
    if (step.connection) {
        parts.push(asSentence(`connect ${step.connection}`));
    }
    if (step.conditions) {
        parts.push(asSentence(step.conditions));
    }
    parts.push(asSentence(`expect ${renderExpectedSpoken(step.expected)}`));
    parts.push(asSentence(`if yes, ${step.outcomeYes}`));
    parts.push(asSentence(`if no, ${step.outcomeNo}`));
    return parts.join(' ');
}

/** Every spoken line for a test: an intro line, then one line per step. */
export function renderTestSpoken(test: TestDefinition): string[] {
    const intro = asSentence(
        `${test.title}: ${test.summary} ${test.steps.length} ${test.steps.length === 1 ? 'step' : 'steps'}`,
    );
    const steps = test.steps.map((step, index) => renderStepSpoken(step, index + 1, test.steps.length));
    return [intro, ...steps];
}
