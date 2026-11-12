import { describe, expect, it } from 'vitest';
import {
    AcknowledgeDiagnosticJobRequestSchema,
    CreateDiagnosticJobRequestSchema,
    CONSULT_TOOL_BUDGET_MS,
    JOB_SUBMIT_TIMEOUT_MS,
    TERMINAL_JOB_EVENT_KINDS,
    diagnosisToJobEvents,
    diagnosticJobSnapshotText,
    jobStepOrigin,
    jobStepToPhysicalStep,
    vehicleSummaryText,
    type DiagnosticJobEvent,
    type NeurosymbolicState,
} from '../jobs';

function state(
    overrides: Partial<NeurosymbolicState['finalDiagnosis']> = {},
    alerts: string[] = [],
): NeurosymbolicState {
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

    it('maps REQUEST_MORE_INFO to a measure step with the required actions, for a live session', () => {
        const events = diagnosisToJobEvents(
            state({
                decision: 'REQUEST_MORE_INFO',
                userOutput: 'Need a reading.',
                requiredActions: ['Check fuel pressure'],
            }),
            'live-session',
        );
        expect(events).toEqual([
            { kind: 'measure', text: 'Need a reading.\nMeasure or check next: Check fuel pressure' },
        ]);
    });

    it('never maps a background job to a measure step', () => {
        const events = diagnosisToJobEvents(
            state({
                decision: 'REQUEST_MORE_INFO',
                userOutput: 'Need a reading.',
                requiredActions: ['Check fuel pressure'],
            }),
        );
        expect(events).toEqual([
            {
                kind: 'finding',
                text:
                    'Need a reading.\n' +
                    'The next check needs a measurement, but a background job cannot issue a physical step. ' +
                    'Ask for it in a live session.',
            },
        ]);
        expect(events[0].kind).not.toBe('measure');
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
        expect(() => CreateDiagnosticJobRequestSchema.parse({ question: '', sessionId: 's', userId: 'u' })).toThrow();
        expect(() =>
            CreateDiagnosticJobRequestSchema.parse({
                question: 'q',
                caseId: 'not-a-uuid',
                sessionId: 's',
                userId: 'u',
            }),
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
            diagnosticJobSnapshotText({
                caseId: '00000000-0000-0000-0000-000000000001',
                question: 'Why the squeal?',
                vehicleSummary: '2019 Honda Civic',
            }),
        ).toBe('Case 00000000-0000-0000-0000-000000000001 · 2019 Honda Civic · Question: Why the squeal?');
        expect(vehicleSummaryText({ year: 2019, make: 'Honda', model: 'Civic' })).toBe('2019 Honda Civic');
        expect(vehicleSummaryText({})).toBe('unknown vehicle');
    });

    it('carries a scripted step on a measure event, and maps it to a policy step', () => {
        const event: DiagnosticJobEvent = {
            jobId: '00000000-0000-0000-0000-000000000001',
            seq: 1,
            kind: 'measure',
            text: 'Step 2 of 3. Disconnect the orange HV cables.',
            step: {
                stepId: 'hv-isolation-test:step-2',
                testId: 'hv-isolation-test',
                instruction: 'disconnect the orange HV cables',
                safetyClass: 'hazardous',
                hazards: ['HIGH_VOLTAGE'],
                vin: '1HGCM82633A004352',
                origin: 'live-session',
            },
            createdAt: '2026-11-11T00:00:00.000Z',
        };
        expect(jobStepOrigin(event.step)).toBe('live-session');
        expect(jobStepToPhysicalStep(event.step!)).toEqual({
            stepId: 'hv-isolation-test:step-2',
            testId: 'hv-isolation-test',
            instruction: 'disconnect the orange HV cables',
            safetyClass: 'hazardous',
            hazards: ['HIGH_VOLTAGE'],
            vin: '1HGCM82633A004352',
        });
    });

    it('treats a step with no origin as a background job, failing closed', () => {
        expect(jobStepOrigin(undefined)).toBe('background-job');
    });
});
