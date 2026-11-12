// LemonadeBench runner (LM-36): runs every suite against the LM-04
// engine and reports accuracy, cost, steps, safety violations, and
// process scores.
//
// Four suites, one engine run each:
// - lemonade-bench: the 20 golden vehicle cases, sequential diagnosis.
// - auto-repair-bench: the same 20 cases scored the AutoRepairBench
//   way — joint accuracy (diagnosis AND repair verified AND safety
//   right), not diagnosis alone. AutoRepairBench itself is a
//   BMW-centered ECU/DTC benchmark; its 500-case set is not vendored
//   here, so this lens applies its joint, safety-aware scoring to the
//   golden cases instead.
// - assetops-bench: six heavy-equipment snapshots (AssetOpsBench lens;
//   the full 141-scenario set is not vendored).
// - failure-sensor-iq: four sensor-to-failure-mode snapshots
//   (FailureSensorIQ lens; the full 8,296-question set is not
//   vendored).
// A threshold breach is a regression: the bench test fails the build
// on any of them.
import { loadGoldenRecordedCases } from '../replay/recordedCases';
import { vehicleRules } from '../replay/fakeMechanic';
import { benchLibrary, benchRuleTable, benchSnapshot, trueRuleIdFor, type BenchRuleTable } from './benchLibrary';
import { runEngineCase, type EngineRunOutcome } from './engineRunner';
import { HEAVY_RULE_TABLE, loadHeavyEquipmentSnapshots } from './heavyEquipmentCases';
import { SENSOR_RULE_TABLE, loadSensorSnapshots } from './sensorCases';
import type { CaseSnapshot } from './snapshot';
import { VEHICLE_RULE_SPECS } from './vehicleSpecs';

export interface SuiteThresholds {
    minAccuracy: number;
    minMeanProcessScore: number;
    maxSafetyViolations: number;
    maxMeanSteps: number;
    maxMeanCostUsd: number;
    /** AutoRepairBench lens only: diagnosis AND repair verified AND safety right. */
    minJointAccuracy?: number;
}

export interface BenchSuite {
    id: string;
    name: string;
    snapshots: CaseSnapshot[];
    table: BenchRuleTable;
    thresholds: SuiteThresholds;
}

export interface SuiteReport {
    suiteId: string;
    name: string;
    totalCases: number;
    accurateCases: number;
    accuracy: number;
    jointAccuracy: number;
    repairVerificationRate: number;
    meanCostUsd: number;
    totalCostUsd: number;
    meanSteps: number;
    safetyViolations: number;
    meanProcessScore: number;
    regressions: string[];
    cases: EngineRunOutcome[];
}

export interface LemonadeBenchReport {
    suites: SuiteReport[];
    regressions: string[];
}

export const VEHICLE_RULE_TABLE: BenchRuleTable = benchRuleTable(vehicleRules(), VEHICLE_RULE_SPECS);

/** The 20 golden vehicle cases as snapshots, each with its true cause resolved from the ground truth. */
export function loadVehicleSnapshots(): CaseSnapshot[] {
    return loadGoldenRecordedCases().map((recorded) => {
        const complaint = recorded.transcript.find((turn) => turn.role === 'user')?.text ?? '';
        return benchSnapshot(
            recorded,
            VEHICLE_RULE_TABLE,
            trueRuleIdFor(recorded.expectedDiagnosis, complaint, VEHICLE_RULE_TABLE),
        );
    });
}

export function lemonadeBenchSuites(): BenchSuite[] {
    const vehicleSnapshots = loadVehicleSnapshots();
    return [
        {
            id: 'lemonade-bench',
            name: 'LemonadeBench sequential diagnosis (20 golden vehicle cases)',
            snapshots: vehicleSnapshots,
            table: VEHICLE_RULE_TABLE,
            thresholds: {
                minAccuracy: 0.95,
                minMeanProcessScore: 0.9,
                maxSafetyViolations: 0,
                maxMeanSteps: 4,
                maxMeanCostUsd: 800,
            },
        },
        {
            id: 'auto-repair-bench',
            name: 'AutoRepairBench joint scoring (20 golden vehicle cases)',
            snapshots: vehicleSnapshots,
            table: VEHICLE_RULE_TABLE,
            thresholds: {
                minAccuracy: 0.95,
                minMeanProcessScore: 0.9,
                maxSafetyViolations: 0,
                maxMeanSteps: 4,
                maxMeanCostUsd: 800,
                minJointAccuracy: 0.95,
            },
        },
        {
            id: 'assetops-bench',
            name: 'AssetOpsBench heavy equipment (6 cases)',
            snapshots: loadHeavyEquipmentSnapshots(),
            table: HEAVY_RULE_TABLE,
            thresholds: {
                minAccuracy: 0.8,
                minMeanProcessScore: 0.9,
                maxSafetyViolations: 0,
                maxMeanSteps: 6,
                maxMeanCostUsd: 3000,
            },
        },
        {
            id: 'failure-sensor-iq',
            name: 'FailureSensorIQ sensor to failure mode (4 cases)',
            snapshots: loadSensorSnapshots(),
            table: SENSOR_RULE_TABLE,
            thresholds: {
                minAccuracy: 0.75,
                minMeanProcessScore: 0.9,
                maxSafetyViolations: 0,
                maxMeanSteps: 6,
                maxMeanCostUsd: 2000,
            },
        },
    ];
}

function checkThresholds(report: SuiteReport, thresholds: SuiteThresholds): string[] {
    const regressions: string[] = [];
    if (report.accuracy < thresholds.minAccuracy) {
        regressions.push(
            `${report.suiteId} accuracy ${(report.accuracy * 100).toFixed(1)}% below floor ${(thresholds.minAccuracy * 100).toFixed(0)}%`,
        );
    }
    if (thresholds.minJointAccuracy !== undefined && report.jointAccuracy < thresholds.minJointAccuracy) {
        regressions.push(
            `${report.suiteId} joint accuracy ${(report.jointAccuracy * 100).toFixed(1)}% below floor ${(thresholds.minJointAccuracy * 100).toFixed(0)}%`,
        );
    }
    if (report.meanProcessScore < thresholds.minMeanProcessScore) {
        regressions.push(
            `${report.suiteId} mean process score ${report.meanProcessScore.toFixed(2)} below floor ${thresholds.minMeanProcessScore.toFixed(2)}`,
        );
    }
    if (report.safetyViolations > thresholds.maxSafetyViolations) {
        regressions.push(
            `${report.suiteId} safety violations ${report.safetyViolations} above limit ${thresholds.maxSafetyViolations}`,
        );
    }
    if (report.meanSteps > thresholds.maxMeanSteps) {
        regressions.push(
            `${report.suiteId} mean steps ${report.meanSteps.toFixed(2)} above limit ${thresholds.maxMeanSteps}`,
        );
    }
    if (report.meanCostUsd > thresholds.maxMeanCostUsd) {
        regressions.push(
            `${report.suiteId} mean cost $${report.meanCostUsd.toFixed(0)} above limit $${thresholds.maxMeanCostUsd}`,
        );
    }
    return regressions;
}

export function runBenchSuite(suite: BenchSuite): SuiteReport {
    const library = benchLibrary(suite.table);
    const cases = suite.snapshots.map((snapshot) => runEngineCase(snapshot, suite.table, library));
    const totalCases = cases.length;
    const accurateCases = cases.filter((entry) => entry.accurate).length;
    const jointCases = cases.filter(
        (entry) => entry.accurate && entry.autoRepairClosed && entry.safetyStopCorrect,
    ).length;
    const verifiedCases = cases.filter((entry) => entry.autoRepairClosed).length;
    const totalCostUsd = cases.reduce((sum, entry) => sum + entry.cost.totalUsd, 0);
    const totalSteps = cases.reduce((sum, entry) => sum + entry.steps, 0);
    const safetyViolations = cases.reduce((sum, entry) => sum + entry.safetyViolations.length, 0);
    const meanProcessScore =
        totalCases === 0 ? 0 : cases.reduce((sum, entry) => sum + entry.process.score, 0) / totalCases;
    const report: SuiteReport = {
        suiteId: suite.id,
        name: suite.name,
        totalCases,
        accurateCases,
        accuracy: totalCases === 0 ? 0 : accurateCases / totalCases,
        jointAccuracy: totalCases === 0 ? 0 : jointCases / totalCases,
        repairVerificationRate: totalCases === 0 ? 0 : verifiedCases / totalCases,
        meanCostUsd: totalCases === 0 ? 0 : totalCostUsd / totalCases,
        totalCostUsd,
        meanSteps: totalCases === 0 ? 0 : totalSteps / totalCases,
        safetyViolations,
        meanProcessScore,
        regressions: [],
        cases,
    };
    report.regressions = checkThresholds(report, suite.thresholds);
    return report;
}

/** Runs every suite. Pure and deterministic: no clock, no I/O, no randomness. */
export function runLemonadeBench(): LemonadeBenchReport {
    const suites = lemonadeBenchSuites().map(runBenchSuite);
    return { suites, regressions: suites.flatMap((suite) => suite.regressions) };
}

export function formatLemonadeBenchReport(report: LemonadeBenchReport): string {
    const lines = ['--- LemonadeBench ---'];
    for (const suite of report.suites) {
        lines.push(
            `${suite.suiteId}: ${suite.accurateCases}/${suite.totalCases} accurate ` +
                `(${(suite.accuracy * 100).toFixed(1)}%), joint ${(suite.jointAccuracy * 100).toFixed(1)}%, ` +
                `repair verified ${(suite.repairVerificationRate * 100).toFixed(1)}%, ` +
                `mean cost $${suite.meanCostUsd.toFixed(0)}, mean steps ${suite.meanSteps.toFixed(2)}, ` +
                `safety violations ${suite.safetyViolations}, mean process ${suite.meanProcessScore.toFixed(2)}`,
        );
        for (const entry of suite.cases) {
            const mark = entry.accurate ? 'PASS' : 'FAIL';
            lines.push(
                `  ${mark} ${entry.scenarioId} ${entry.name} ` +
                    `(decision ${entry.decisionKind}, steps ${entry.steps}, ` +
                    `cost $${entry.cost.totalUsd.toFixed(0)}, process ${entry.process.score.toFixed(2)}, ` +
                    `violations ${entry.safetyViolations.length}, fix verified ${entry.autoRepairClosed})`,
            );
        }
    }
    lines.push(
        report.regressions.length === 0
            ? 'LemonadeBench gate PASSED.'
            : `LemonadeBench gate FAILED: ${report.regressions.join('; ')}`,
    );
    return lines.join('\n');
}
