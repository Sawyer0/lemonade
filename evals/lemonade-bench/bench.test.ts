import { describe, expect, it } from 'vitest';
import { formatLemonadeBenchReport, loadVehicleSnapshots, runLemonadeBench } from './benchRunner';

describe('LemonadeBench', () => {
    it('loads 20 golden vehicle snapshots with a true cause each', () => {
        const snapshots = loadVehicleSnapshots();
        expect(snapshots).toHaveLength(20);
        for (const snapshot of snapshots) {
            expect(snapshot.trueHypothesisId).not.toBe('');
            expect(snapshot.recordedTests).toHaveLength(2);
        }
    });

    it('runs 20 golden cases against the LM-04 engine and reports accuracy, cost and process scores', () => {
        const report = runLemonadeBench();
        const [vehicle] = report.suites.filter((suite) => suite.suiteId === 'lemonade-bench');
        expect(vehicle).toBeDefined();
        expect(vehicle!.totalCases).toBe(20);
        expect(vehicle!.accuracy).toBe(1);
        expect(vehicle!.safetyViolations).toBe(0);
        expect(vehicle!.meanProcessScore).toBe(1);
        expect(vehicle!.meanSteps).toBeCloseTo(2.45, 2);
        expect(vehicle!.meanCostUsd).toBeCloseTo(545, 0);
        expect(vehicle!.cases.every((entry) => entry.decisionKind === 'repair')).toBe(true);
    });

    it('scores the AutoRepairBench lens jointly: diagnosis, verified repair, and safety', () => {
        const report = runLemonadeBench();
        const [autoRepair] = report.suites.filter((suite) => suite.suiteId === 'auto-repair-bench');
        expect(autoRepair).toBeDefined();
        expect(autoRepair!.totalCases).toBe(20);
        expect(autoRepair!.jointAccuracy).toBe(1);
        expect(autoRepair!.repairVerificationRate).toBe(1);
    });

    it('runs the heavy-equipment and sensor suites too', () => {
        const report = runLemonadeBench();
        const [assetOps] = report.suites.filter((suite) => suite.suiteId === 'assetops-bench');
        const [sensors] = report.suites.filter((suite) => suite.suiteId === 'failure-sensor-iq');
        expect(assetOps).toBeDefined();
        expect(assetOps!.totalCases).toBe(6);
        expect(assetOps!.accuracy).toBe(1);
        expect(assetOps!.safetyViolations).toBe(0);
        expect(sensors).toBeDefined();
        expect(sensors!.totalCases).toBe(4);
        expect(sensors!.accuracy).toBe(1);
        expect(sensors!.meanProcessScore).toBe(1);
    });

    it('stops work on the two safety hazards and on nothing else', () => {
        const report = runLemonadeBench();
        const [vehicle] = report.suites.filter((suite) => suite.suiteId === 'lemonade-bench');
        expect(vehicle).toBeDefined();
        const stops = vehicle!.cases.filter(
            (entry) => entry.committedHypothesisId === 'fuel-leak' || entry.committedHypothesisId === 'hv-cable',
        );
        expect(stops.map((entry) => entry.scenarioId).sort()).toEqual(['scenario-10', 'scenario-2']);
        expect(vehicle!.cases.every((entry) => entry.safetyStopCorrect)).toBe(true);
    });

    it('is deterministic: two runs give the identical report', () => {
        expect(runLemonadeBench()).toEqual(runLemonadeBench());
    });

    it('fails the build on any regression', () => {
        const report = runLemonadeBench();
        expect(report.regressions).toEqual([]);
        expect(report.suites.every((suite) => suite.regressions.length === 0)).toBe(true);
    });

    it('prints accuracy, cost, steps, violations and process scores in the formatted report', () => {
        const text = formatLemonadeBenchReport(runLemonadeBench());
        expect(text).toContain('lemonade-bench: 20/20 accurate (100.0%)');
        expect(text).toContain('mean cost $545');
        expect(text).toContain('mean steps 2.45');
        expect(text).toContain('safety violations 0');
        expect(text).toContain('mean process 1.00');
        expect(text).toContain('LemonadeBench gate PASSED.');
    });
});
