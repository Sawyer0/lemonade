import type { TestDefinition } from '../testSchema';

// --- Test fixture (LM-34) ---
// One valid definition to start from; each test overrides only the fields
// its case is about, so a schema change stays a one-file edit.

export function validTestDefinition(overrides: Partial<TestDefinition> = {}): TestDefinition {
    return {
        id: 'measure-oxygen-sensor-switching',
        title: 'Measure oxygen sensor switching',
        summary: 'Compare the upstream sensor switching against the downstream sensor holding steady.',
        costTier: 'measure',
        safetyClass: 'caution',
        hazards: ['HOT_SURFACES'],
        disassemblyState: 'none',
        targets: [
            {
                hypothesisId: 'catalyst-degraded',
                dtcCodes: ['P0420'],
                hitRate: 0.85,
                falseAlarmRate: 0.15,
            },
        ],
        cost: {
            laborMinutes: 20,
            tools: ['scan tool'],
            parts: [],
        },
        preconditions: [
            {
                id: 'ventilation',
                description: 'Work outdoors or with exhaust extraction.',
                safety: true,
            },
        ],
        steps: [
            {
                location: 'scan tool live data, upstream oxygen sensor',
                instruction: 'hold 2500 rpm steady and watch the upstream sensor voltage',
                connection: 'scan tool on the OBD port',
                conditions: 'engine and catalyst warm, steady 2500 rpm',
                expected: { kind: 'range', min: 0.1, max: 0.9, unit: 'volts' },
                outcomeYes: 'the upstream sensor switches, so read the downstream sensor next',
                outcomeNo: 'the upstream sensor is flat, so the sensor itself is the suspect',
            },
        ],
        verification: {
            status: 'verified',
            source: 'expert',
            reviewedBy: 'master-tech-1',
            reviewedAt: '2026-11-11',
        },
        ...overrides,
    };
}
