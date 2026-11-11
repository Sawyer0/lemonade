import { describe, it, expect } from 'vitest';
import { renderExpectedSpoken, renderStepSpoken, renderTestSpoken } from '../stepSpeech';
import { validTestDefinition } from './testDefinitionFactory';

const step = validTestDefinition().steps[0];

describe('renderExpectedSpoken', () => {
    it('renders a single value with its unit', () => {
        expect(renderExpectedSpoken({ kind: 'value', value: 3.5, unit: 'volts' })).toBe('3.5 volts');
    });

    it('renders a range as between min and max', () => {
        expect(renderExpectedSpoken({ kind: 'range', min: 0.1, max: 0.9, unit: 'volts' })).toBe(
            'between 0.1 and 0.9 volts',
        );
    });

    it('renders plain-language expectations as written', () => {
        expect(renderExpectedSpoken({ kind: 'text', text: 'no smoke escapes anywhere' })).toBe(
            'no smoke escapes anywhere',
        );
    });
});

describe('renderStepSpoken', () => {
    it('renders location, connection, conditions, expectation, and both outcomes', () => {
        expect(renderStepSpoken(step, 1, 2)).toBe(
            'Step 1 of 2. At scan tool live data, upstream oxygen sensor, hold 2500 rpm steady and watch the upstream sensor voltage. Connect scan tool on the OBD port. Engine and catalyst warm, steady 2500 rpm. Expect between 0.1 and 0.9 volts. If yes, the upstream sensor switches, so read the downstream sensor next. If no, the upstream sensor is flat, so the sensor itself is the suspect.',
        );
    });

    it('skips connection and conditions when the step has none', () => {
        const askStep = {
            location: 'driver seat, talking with the driver',
            instruction: 'ask whether the shake happens cold, warm, at idle, or only under load',
            expected: { kind: 'text', text: 'a clear pattern' } as const,
            outcomeYes: 'the pattern points at one system',
            outcomeNo: 'no pattern emerges',
        };
        expect(renderStepSpoken(askStep, 1, 1)).toBe(
            'Step 1 of 1. At driver seat, talking with the driver, ask whether the shake happens cold, warm, at idle, or only under load. Expect a clear pattern. If yes, the pattern points at one system. If no, no pattern emerges.',
        );
    });

    it('renders a single-value expectation', () => {
        const valueStep = {
            ...step,
            expected: { kind: 'value', value: 12.6, unit: 'volts' } as const,
        };
        expect(renderStepSpoken(valueStep, 2, 2)).toContain('Expect 12.6 volts.');
    });
});

describe('renderTestSpoken', () => {
    it('renders an intro line plus one line per step', () => {
        const lines = renderTestSpoken(validTestDefinition());
        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe(
            'Measure oxygen sensor switching: Compare the upstream sensor switching against the downstream sensor holding steady. 1 step.',
        );
        expect(lines[1]).toContain('Step 1 of 1.');
    });

    it('pins the exact spoken words for a two-step test', () => {
        const twoStep = validTestDefinition({
            steps: [
                step,
                {
                    location: 'scan tool live data, downstream oxygen sensor',
                    instruction: 'hold the same steady 2500 rpm and watch the downstream sensor voltage',
                    connection: 'scan tool on the OBD port',
                    conditions: 'engine and catalyst warm, steady 2500 rpm',
                    expected: {
                        kind: 'text',
                        text: 'downstream voltage holds near steady instead of switching like the upstream sensor',
                    },
                    outcomeYes: 'the catalyst is doing its job',
                    outcomeNo: 'the downstream sensor mirrors the upstream switching, so the catalyst is degraded',
                },
            ],
        });
        expect(renderTestSpoken(twoStep)).toMatchSnapshot();
    });
});
