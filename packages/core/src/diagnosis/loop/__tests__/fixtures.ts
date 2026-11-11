// Loop test fixtures (LM-04): verified misfire tests with exact rates,
// so the planner's ordering is asserted on numbers, not shrunk drafts.
// Hypothesis ids match the test targets; priors come from the
// InMemoryFixCountStore in loop.test.ts.
import { validTestDefinition } from '../../tests/__tests__/testDefinitionFactory';
import type { TestDefinition } from '../../tests/testSchema';
import type { PriorHypothesis } from '../priors/types';

const VERIFIED = {
    status: 'verified' as const,
    source: 'expert' as const,
    reviewedBy: 'master-tech-1',
    reviewedAt: '2026-11-11',
};

/** Ask the driver first: 5 minutes, no tools, no disassembly. */
export function askMisfireConditions(): TestDefinition {
    return validTestDefinition({
        id: 'ask-misfire-conditions',
        title: 'Ask when the misfire happens',
        summary: 'Narrow the misfire to cold start, warm idle, load, or damp weather before touching the car.',
        costTier: 'ask',
        safetyClass: 'routine',
        hazards: [],
        disassemblyState: 'none',
        targets: [
            { hypothesisId: 'misfire-cylinder-3', dtcCodes: ['P0300'], hitRate: 0.75, falseAlarmRate: 0.3 },
            { hypothesisId: 'ignition-coil-failure', dtcCodes: ['P0300'], hitRate: 0.7, falseAlarmRate: 0.35 },
        ],
        cost: { laborMinutes: 5, tools: [], parts: [] },
        preconditions: [],
        steps: [
            {
                location: 'driver seat, talking with the driver',
                instruction: 'ask whether the shake happens cold, warm, at idle, or only under load',
                expected: { kind: 'text', text: 'a clear pattern, such as only on cold starts' },
                outcomeYes: 'the pattern points at one system',
                outcomeNo: 'no pattern emerges, so move to the visual inspection',
            },
        ],
        verification: VERIFIED,
    });
}

/** Eyes on the ignition parts: needs the cover off and the engine cool. */
export function lookPlugCoilCondition(): TestDefinition {
    return validTestDefinition({
        id: 'look-plug-coil-condition',
        title: 'Look at the plugs and coils',
        summary: 'Eyes on the ignition parts for cracks, carbon tracks, oil, or a loose connector.',
        costTier: 'look',
        safetyClass: 'caution',
        hazards: ['HOT_SURFACES'],
        disassemblyState: 'component-exposed',
        targets: [
            { hypothesisId: 'ignition-coil-failure', dtcCodes: ['P0300'], hitRate: 0.7, falseAlarmRate: 0.2 },
            { hypothesisId: 'spark-plug-fouled', dtcCodes: ['P0300'], hitRate: 0.65, falseAlarmRate: 0.25 },
        ],
        cost: { laborMinutes: 15, tools: ['socket set', 'flashlight'], parts: [] },
        preconditions: [
            { id: 'engine-off', description: 'Engine off and key out before any cover comes off.', safety: true },
            {
                id: 'engine-cool',
                description: 'Engine cool to the touch before reaching near the exhaust side.',
                safety: true,
            },
        ],
        steps: [
            {
                location: 'ignition coil for the misfiring cylinder',
                instruction: 'look for cracks in the coil body, white carbon tracks, oil in the plug well',
                conditions: 'engine off and cool',
                expected: { kind: 'text', text: 'coil body intact, plug well dry, connector fully seated' },
                outcomeYes: 'the ignition parts look sound, so measure spark next',
                outcomeNo: 'a cracked coil, oil, or a loose connector is found',
            },
        ],
        verification: VERIFIED,
    });
}

/** Move the suspect coil: the misfire follows the part or it does not. */
export function swapCoilCylinder(): TestDefinition {
    return validTestDefinition({
        id: 'swap-coil-cylinder',
        title: 'Swap the coil to another cylinder',
        summary: 'Move the suspect coil to a known-good cylinder and see whether the misfire code follows it.',
        costTier: 'swap',
        safetyClass: 'caution',
        hazards: ['HOT_SURFACES'],
        disassemblyState: 'component-exposed',
        targets: [{ hypothesisId: 'ignition-coil-failure', dtcCodes: ['P0300'], hitRate: 0.9, falseAlarmRate: 0.05 }],
        cost: { laborMinutes: 20, tools: ['socket set', 'scan tool'], parts: [] },
        preconditions: [
            { id: 'engine-off', description: 'Engine off and key out before touching any coil.', safety: true },
            {
                id: 'engine-cool',
                description: 'Engine cool to the touch before reaching near the exhaust side.',
                safety: true,
            },
        ],
        steps: [
            {
                location: 'ignition coil on the misfiring cylinder',
                instruction: 'unplug the coil connector and remove the coil',
                conditions: 'engine off and cool',
                expected: { kind: 'text', text: 'coil out with the connector undamaged' },
                outcomeYes: 'the coil is out, so move it to the next cylinder',
                outcomeNo: 'the connector is damaged, so repair the connector first',
            },
        ],
        verification: VERIFIED,
    });
}

/** Spark tester on the plug: separates coil from plug in one measurement. */
export function measureSparkStrength(): TestDefinition {
    return validTestDefinition({
        id: 'measure-spark-strength',
        title: 'Measure spark at the plug',
        summary: 'Check for a strong spark with a spark tester instead of guessing from the code alone.',
        costTier: 'measure',
        safetyClass: 'caution',
        hazards: ['ELECTRICAL_SHORT'],
        disassemblyState: 'component-exposed',
        targets: [
            { hypothesisId: 'ignition-coil-failure', dtcCodes: ['P0300'], hitRate: 0.85, falseAlarmRate: 0.1 },
            { hypothesisId: 'spark-plug-fouled', dtcCodes: ['P0300'], hitRate: 0.8, falseAlarmRate: 0.15 },
        ],
        cost: { laborMinutes: 15, tools: ['spark tester', 'socket set'], parts: [] },
        preconditions: [
            {
                id: 'engine-off-cranks-only',
                description: 'Engine cranked only with the tester grounded, never with a plug wire held by hand.',
                safety: true,
            },
        ],
        steps: [
            {
                location: 'spark plug for the misfiring cylinder',
                instruction: 'remove the plug, connect the spark tester between the coil and ground, and crank',
                connection: 'spark tester grounded to the engine block',
                conditions: 'fuel and ignition live only while cranking',
                expected: { kind: 'text', text: 'a bright blue spark jumps the tester gap on every crank' },
                outcomeYes: 'spark is strong, so the ignition side is sound',
                outcomeNo: 'spark is weak, yellow, or absent, so the coil or plug is the suspect',
            },
        ],
        verification: VERIFIED,
    });
}

export function misfireDefinitions(): TestDefinition[] {
    return [askMisfireConditions(), lookPlugCoilCondition(), swapCoilCylinder(), measureSparkStrength()];
}

/** Priors as the store returns them: coil 7, plugs 5, cylinder-3 2 (P0300). */
export function misfirePriors(): PriorHypothesis[] {
    return [
        { hypothesis: 'ignition-coil-failure', n: 7, q: 7 / 14, pi: 8 / 17, sources: [{ source: 'autorepairbench', observationCount: 7 }] },
        { hypothesis: 'spark-plug-fouled', n: 5, q: 5 / 14, pi: 6 / 17, sources: [{ source: 'autorepairbench', observationCount: 5 }] },
        { hypothesis: 'misfire-cylinder-3', n: 2, q: 2 / 14, pi: 3 / 17, sources: [{ source: 'autorepairbench', observationCount: 2 }] },
    ];
}
