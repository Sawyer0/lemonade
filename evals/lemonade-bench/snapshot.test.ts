import { describe, expect, it } from 'vitest';
import { loadGoldenRecordedCases } from '../replay/recordedCases';
import { INVENTED_NORMAL_READINGS, SnapshotGatekeeper, type CaseSnapshot } from './snapshot';

function snapshotFor(scenarioId: string): CaseSnapshot {
    const [recorded] = loadGoldenRecordedCases().filter((entry) => entry.scenarioId === scenarioId);
    if (recorded === undefined) {
        throw new Error(`No golden case ${scenarioId}`);
    }
    return {
        recorded,
        trueHypothesisId: 'alternator',
        recordedTests: [{ testId: 'measure-alternator', outcome: 'positive', finding: 'Serpentine belt snapped' }],
        safetyCriticalHypothesisIds: [],
    };
}

describe('SnapshotGatekeeper', () => {
    it('returns the recorded outcome and finding for a recorded test', () => {
        const gatekeeper = new SnapshotGatekeeper(snapshotFor('scenario-1'));
        const reading = gatekeeper.orderTest('measure-alternator', 'measure');
        expect(reading).toEqual({
            testId: 'measure-alternator',
            outcome: 'positive',
            reading: 'Serpentine belt snapped',
            recorded: true,
        });
        expect(gatekeeper.recordedReveals()).toBe(1);
        expect(gatekeeper.inventedReveals()).toBe(0);
    });

    it('invents a plausible normal, never an empty answer, for an unrecorded test', () => {
        const gatekeeper = new SnapshotGatekeeper(snapshotFor('scenario-1'));
        const reading = gatekeeper.orderTest('measure-coolant-pressure', 'measure');
        expect(reading.outcome).toBe('negative');
        expect(reading.recorded).toBe(false);
        expect(reading.reading).toBe('Reading within normal range.');
        expect(reading.reading).toBe(INVENTED_NORMAL_READINGS.measure);
        expect(gatekeeper.inventedReveals()).toBe(1);
    });

    it('invents the same normal for the same test no matter which case is behind it', () => {
        const first = new SnapshotGatekeeper(snapshotFor('scenario-1'));
        const second = new SnapshotGatekeeper(snapshotFor('scenario-2'));
        expect(first.orderTest('measure-coolant-pressure', 'measure').reading).toBe(
            second.orderTest('measure-coolant-pressure', 'measure').reading,
        );
        expect(first.orderTest('ask-brake-feel', 'ask').reading).toBe(
            second.orderTest('ask-brake-feel', 'ask').reading,
        );
    });

    it('returns the same reading when the same test is ordered twice', () => {
        const gatekeeper = new SnapshotGatekeeper(snapshotFor('scenario-1'));
        expect(gatekeeper.orderTest('measure-alternator', 'measure')).toEqual(
            gatekeeper.orderTest('measure-alternator', 'measure'),
        );
        expect(gatekeeper.orderTest('measure-coolant-pressure', 'measure')).toEqual(
            gatekeeper.orderTest('measure-coolant-pressure', 'measure'),
        );
    });

    it('never leaks the ground-truth diagnosis in any reading', () => {
        const snapshot = snapshotFor('scenario-2');
        const gatekeeper = new SnapshotGatekeeper(snapshot);
        const diagnosis = snapshot.recorded.expectedDiagnosis;
        const readings = [
            gatekeeper.orderTest('measure-alternator', 'measure'),
            gatekeeper.orderTest('ask-fuel-smell', 'ask'),
            gatekeeper.orderTest('look-brake-pads', 'look'),
            gatekeeper.orderTest('swap-coil', 'swap'),
            gatekeeper.orderTest('tear-down-transmission', 'tear-down'),
        ];
        for (const reading of readings) {
            expect(reading.reading).not.toContain(diagnosis);
        }
        const invented = readings.filter((reading) => !reading.recorded);
        for (const reading of invented) {
            for (const action of snapshot.recorded.expectedActions) {
                expect(reading.reading).not.toContain(action);
            }
        }
    });

    it('tracks every test ordered, in order', () => {
        const gatekeeper = new SnapshotGatekeeper(snapshotFor('scenario-1'));
        gatekeeper.orderTest('ask-misfire-conditions', 'ask');
        gatekeeper.orderTest('measure-alternator', 'measure');
        gatekeeper.orderTest('measure-alternator', 'measure');
        expect(gatekeeper.orderedTests()).toEqual([
            'ask-misfire-conditions',
            'measure-alternator',
            'measure-alternator',
        ]);
    });
});
