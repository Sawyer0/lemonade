import { describe, expect, it } from 'vitest';
import { loadGoldenRecordedCases } from '../replay/recordedCases';
import { formatBenchmarkReport, loadBenchmarkCases, runBenchmark, runSimulatedTechnician } from './benchmark';
import { CostMeter } from './costMeter';
import { CaseGatekeeper } from './gatekeeper';
import { judgeCase } from './judge';

describe('gatekeeper', () => {
    it('reveals one finding per relevant question, in recorded order', () => {
        const [fuel] = loadGoldenRecordedCases().filter((recorded) => recorded.scenarioId === 'scenario-2');
        expect(fuel).toBeDefined();
        const gatekeeper = new CaseGatekeeper(fuel!);
        expect(gatekeeper.ask('smell')).toEqual(['Stop engine immediately']);
        expect(gatekeeper.ask('fluid')).toEqual(['Evacuate vehicle']);
        expect(gatekeeper.orderTest('fluid-leak-inspection')).toEqual(['Do not smoke or use open flames near vehicle']);
        expect(gatekeeper.revealedFindings()).toBe(3);
    });

    it('withholds everything when the question and test are irrelevant to the case', () => {
        const [fuel] = loadGoldenRecordedCases().filter((recorded) => recorded.scenarioId === 'scenario-2');
        expect(fuel).toBeDefined();
        const gatekeeper = new CaseGatekeeper(fuel!);
        expect(gatekeeper.ask('warning')).toEqual([]);
        expect(gatekeeper.orderTest('tire-balance-check')).toEqual([]);
        expect(gatekeeper.revealedFindings()).toBe(0);
    });

    it('reveals nothing once every finding has been revealed', () => {
        const [fuel] = loadGoldenRecordedCases().filter((recorded) => recorded.scenarioId === 'scenario-2');
        expect(fuel).toBeDefined();
        const gatekeeper = new CaseGatekeeper(fuel!);
        gatekeeper.ask('smell');
        gatekeeper.ask('fluid');
        gatekeeper.orderTest('fluid-leak-inspection');
        expect(gatekeeper.ask('smell')).toEqual([]);
    });

    it('rejects unknown questions and tests instead of guessing', () => {
        const [first] = loadGoldenRecordedCases();
        expect(first).toBeDefined();
        const gatekeeper = new CaseGatekeeper(first!);
        expect(() => gatekeeper.ask('no-such-question')).toThrow('Unknown gatekeeper question');
        expect(() => gatekeeper.orderTest('no-such-test')).toThrow('Unknown gatekeeper test');
    });
});

describe('cost meter', () => {
    it('counts questions at one minute and tests at five', () => {
        const meter = new CostMeter();
        meter.recordQuestion();
        meter.recordQuestion();
        meter.recordTest();
        expect(meter.totals()).toEqual({ questions: 2, tests: 1, minutes: 7 });
    });
});

describe('judge', () => {
    it('scores a complete case 5', () => {
        expect(judgeCase({ diagnosisMatch: true, safetyMatch: true, actionsCovered: 3, actionsTotal: 3 }).score).toBe(
            5,
        );
    });

    it('scores a correct case with half the actions 4', () => {
        expect(judgeCase({ diagnosisMatch: true, safetyMatch: true, actionsCovered: 2, actionsTotal: 3 }).score).toBe(
            4,
        );
    });

    it('scores a correct case with thin actions 3', () => {
        expect(judgeCase({ diagnosisMatch: true, safetyMatch: true, actionsCovered: 0, actionsTotal: 3 }).score).toBe(
            3,
        );
    });

    it('scores a case right on only one of diagnosis and safety 2', () => {
        expect(judgeCase({ diagnosisMatch: true, safetyMatch: false, actionsCovered: 0, actionsTotal: 3 }).score).toBe(
            2,
        );
        expect(judgeCase({ diagnosisMatch: false, safetyMatch: true, actionsCovered: 0, actionsTotal: 3 }).score).toBe(
            2,
        );
    });

    it('scores a case wrong on both 1', () => {
        expect(judgeCase({ diagnosisMatch: false, safetyMatch: false, actionsCovered: 0, actionsTotal: 3 }).score).toBe(
            1,
        );
    });
});

describe('simulated technician', () => {
    it('works the fuel-leak case in 2 questions and 2 tests', () => {
        const [fuel] = loadGoldenRecordedCases().filter((recorded) => recorded.scenarioId === 'scenario-2');
        expect(fuel).toBeDefined();
        const result = runSimulatedTechnician(fuel!);
        expect(result.diagnosis.safetyStop).toBe(true);
        expect(result.diagnosis.ruleId).toBe('fuel-leak');
        expect(result.findingsRevealed).toBe(3);
        // The second test is the exhaust inspection, triggered by "smoke"
        // in the revealed "Do not smoke" finding; it comes back empty.
        expect(result.testsOrdered).toBe(2);
        expect(result.minutesSpent).toBe(12);
    });

    it('works the orange HV cable case in 1 question and 1 test', () => {
        const [hv] = loadGoldenRecordedCases().filter((recorded) => recorded.scenarioId === 'scenario-10');
        expect(hv).toBeDefined();
        const result = runSimulatedTechnician(hv!);
        expect(result.diagnosis.safetyStop).toBe(true);
        expect(result.diagnosis.ruleId).toBe('hv-cable');
        expect(result.findingsRevealed).toBe(2);
        expect(result.testsOrdered).toBe(1);
        expect(result.minutesSpent).toBe(6);
    });
});

describe('benchmark', () => {
    it('covers 24 cases: 20 golden plus 4 safety paraphrases', () => {
        expect(loadBenchmarkCases()).toHaveLength(24);
    });

    it('reports accuracy, cost and pass^3 for all 24 cases', () => {
        const report = runBenchmark(loadBenchmarkCases());
        expect(report.totalCases).toBe(24);
        expect(report.passedCases).toBe(24);
        expect(report.accuracyPct).toBe(100);
        expect(report.passCubed).toBe(1);
        expect(report.attempts).toBe(3);
        expect(report.meanScore).toBe(5);
        expect(report.cases.every((entry) => entry.score === 5)).toBe(true);
        expect(report.meanTests).toBeGreaterThan(0);
        expect(report.meanTests).toBeLessThanOrEqual(3);
        expect(report.meanMinutes).toBeGreaterThan(0);
        expect(report.meanMinutes).toBeLessThanOrEqual(20);
    });

    it('is deterministic: two runs give the identical report', () => {
        const cases = loadBenchmarkCases();
        expect(runBenchmark(cases)).toEqual(runBenchmark(loadBenchmarkCases()));
    });

    it('passes the safety paraphrases, not just the recorded wording', () => {
        const report = runBenchmark(loadBenchmarkCases());
        const paraphrases = report.cases.filter((entry) => entry.scenarioId.startsWith('safety-'));
        expect(paraphrases).toHaveLength(4);
        expect(paraphrases.every((entry) => entry.passed)).toBe(true);
    });

    it('prints accuracy, cost and pass^3 in the formatted report', () => {
        const report = runBenchmark(loadBenchmarkCases());
        const text = formatBenchmarkReport(report);
        expect(text).toContain('Accuracy: 100.0%');
        expect(text).toContain('pass^3: 100.0%');
        expect(text).toContain('Cost:');
    });
});
