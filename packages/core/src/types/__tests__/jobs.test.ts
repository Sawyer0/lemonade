import { describe, expect, it } from 'vitest';
import {
    AcknowledgeDiagnosticJobRequestSchema,
    CreateDiagnosticJobRequestSchema,
    CONSULT_TOOL_BUDGET_MS,
    JOB_SUBMIT_TIMEOUT_MS,
    TERMINAL_JOB_EVENT_KINDS,
    diagnosisToJobEvents,
    diagnosticJobSnapshotText,
    vehicleSummaryText,
    type NeurosymbolicState,
} from '../jobs';

function state(overrides: Partial<NeurosymbolicState['finalDiagnosis']> = {}, alerts: string[] = []): NeurosymbolicState {
    return {
        finalDiagnosis: {
            decision: 'PROCEED',
            reasoningTrace: 'trace',
            userOutput: 'Replace the sensor.',
            requiredActions: [],
            metaConfidence: 0.9,
            ...overrides,
        },
        authorityData: {
            vin: 'VIN',
            nhtsaRecalls: [],
            manualSpecs: null,
            safetyAlerts: alerts,
        },
    } as NeurosymbolicState;
}

describe('jobs types', () => {
    it('keeps the submit timeout inside the talker tool budget', () => {
        expect(JOB_SUBMIT_TIMEOUT_MS).toBeLessThan(CONSULT_TOOL_BUDGET_MS);
    });

    it('treats finding, measure, safety_stop, failed and cancelled as terminal', () => {
        expect([...TERMINAL_JOB_EVENT_KINDS].sort()).toEqual([
            'cancelled',
            'failed',
            'finding',
            'measure',
            'safety_stop',
        ]);
    });

    it('maps STOP_DANGER to a safety stop', () => {
        expect(diagnosisToJobEvents(state({ decision: 'STOP_DANGER' }))).toEqual([
            { kind: 'safety_stop', text: 'Replace the sensor.' },
        ]);
    });

    it('maps REQUEST_MORE_INFO to a measure step with the required actions', () => {
        const events = diagnosisToJobEvents(
            state({ decision: 'REQUEST_MORE_INFO', userOutput: 'Need a reading.', requiredActions: ['Check fuel pressure'] }),
        );
        expect(events).toEqual([{ kind: 'measure', text: 'Need a reading.\nMeasure or check next: Check fuel pressure' }]);
    });

    it('maps PROCEED and REFER_TO_HUMAN to a finding', () => {
        expect(diagnosisToJobEvents(state())).toEqual([{ kind: 'finding', text: 'Replace the sensor.' }]);
        expect(diagnosisToJobEvents(state({ decision: 'REFER_TO_HUMAN' }))).toEqual([
            { kind: 'finding', text: 'Replace the sensor.' },
        ]);
    });

    it('appends manual safety alerts to a finding, never silently', () => {
        const events = diagnosisToJobEvents(state({}, ['Disconnect the 12V battery first.']));
        expect(events).toEqual([
            { kind: 'finding', text: 'Replace the sensor.\nSafety notes: Disconnect the 12V battery first.' },
        ]);
    });

    it('rejects an empty question and a non-UUID case id', () => {
        expect(() =>
            CreateDiagnosticJobRequestSchema.parse({ question: '', sessionId: 's', userId: 'u' }),
        ).toThrow();
        expect(() =>
            CreateDiagnosticJobRequestSchema.parse({ question: 'q', caseId: 'not-a-uuid', sessionId: 's', userId: 'u' }),
        ).toThrow();
    });

    it('defaults evidence refs and vehicle to empty', () => {
        const parsed = CreateDiagnosticJobRequestSchema.parse({ question: 'q', sessionId: 's', userId: 'u' });
        expect(parsed.evidenceRefs).toEqual([]);
        expect(parsed.vehicle).toEqual({});
    });

    it('rejects a negative ack seq', () => {
        expect(() => AcknowledgeDiagnosticJobRequestSchema.parse({ seq: -1 })).toThrow();
        expect(AcknowledgeDiagnosticJobRequestSchema.parse({ seq: 3 })).toEqual({ seq: 3 });
    });

    it('summarises a job and a vehicle for the snapshot event', () => {
        expect(
            diagnosticJobSnapshotText({ caseId: '00000000-0000-0000-0000-000000000001', question: 'Why the squeal?', vehicleSummary: '2019 Honda Civic' }),
        ).toBe('Case 00000000-0000-0000-0000-000000000001 · 2019 Honda Civic · Question: Why the squeal?');
        expect(vehicleSummaryText({ year: 2019, make: 'Honda', model: 'Civic' })).toBe('2019 Honda Civic');
        expect(vehicleSummaryText({})).toBe('unknown vehicle');
    });
});
