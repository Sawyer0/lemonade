import { diagnoseEvidence } from '../replay/fakeMechanic';
import { loadGoldenRecordedCases, safetyRegressionEntries } from '../replay/recordedCases';
import { recordedCaseFromScenario, type RecordedCase } from '../replay/recordedCase';
import { actionsCovered, diagnosisMatches } from '../replay/replayRunner';
import { CostMeter } from './costMeter';
import { CaseGatekeeper, GATEKEEPER_QUESTIONS, GATEKEEPER_TESTS } from './gatekeeper';
import { judgeCase } from './judge';

function mentionsAny(text: string, keywords: string[]): boolean {
    const lowered = text.toLowerCase();
    return keywords.some((keyword) => lowered.includes(keyword));
}

/**
 * The simulated technician. It starts with only the presenting complaint,
 * asks the gatekeeper's panel questions whose topics appear in what it
 * knows so far, orders the catalog tests whose triggers appear, and
 * diagnoses from the complaint plus whatever the gatekeeper revealed.
 * Questions and tests repeat to a fixpoint: a revealed finding can
 * unlock a question or test that did not qualify before. Each question
 * and test is asked at most once.
 */
export interface TechnicianResult {
    diagnosis: ReturnType<typeof diagnoseEvidence>;
    evidence: string;
    testsOrdered: number;
    minutesSpent: number;
    findingsRevealed: number;
}

export function runSimulatedTechnician(recordedCase: RecordedCase): TechnicianResult {
    const gatekeeper = new CaseGatekeeper(recordedCase);
    const meter = new CostMeter();
    let knownText = recordedCase.transcript.find((turn) => turn.role === 'user')?.text ?? '';
    const askedQuestions = new Set<string>();
    const orderedTests = new Set<string>();

    let progressed = true;
    while (progressed) {
        progressed = false;
        for (const question of GATEKEEPER_QUESTIONS) {
            if (askedQuestions.has(question.id) || !mentionsAny(knownText, question.keywords)) {
                continue;
            }
            askedQuestions.add(question.id);
            meter.recordQuestion();
            const revealed = gatekeeper.ask(question.id);
            if (revealed.length > 0) {
                knownText += `\n${revealed.join('\n')}`;
                progressed = true;
            }
        }
        for (const test of GATEKEEPER_TESTS) {
            if (orderedTests.has(test.name) || !mentionsAny(knownText, test.triggers)) {
                continue;
            }
            orderedTests.add(test.name);
            meter.recordTest();
            const revealed = gatekeeper.orderTest(test.name);
            if (revealed.length > 0) {
                knownText += `\n${revealed.join('\n')}`;
                progressed = true;
            }
        }
    }

    const totals = meter.totals();
    return {
        diagnosis: diagnoseEvidence(knownText),
        evidence: knownText,
        testsOrdered: totals.tests,
        minutesSpent: totals.minutes,
        findingsRevealed: gatekeeper.revealedFindings(),
    };
}

export interface BenchmarkCaseResult {
    caseId: string;
    scenarioId: string;
    name: string;
    score: number;
    passed: boolean;
    passedAllAttempts: boolean;
    testsOrdered: number;
    minutesSpent: number;
    findingsRevealed: number;
}

export interface BenchmarkReport {
    totalCases: number;
    passedCases: number;
    accuracyPct: number;
    /** pass^k: share of cases passing every one of k attempts. */
    passCubed: number;
    attempts: number;
    meanScore: number;
    meanTests: number;
    meanMinutes: number;
    totalTests: number;
    totalMinutes: number;
    cases: BenchmarkCaseResult[];
}

/**
 * The benchmark: every recorded case through the simulated technician,
 * each case attempted k times. The fakes are deterministic, so attempts
 * agree; pass^k still reports the honest share passing all k runs, and
 * would drop below accuracy the moment a run disagrees.
 */
export function runBenchmark(recordedCases: RecordedCase[], attempts: number = 3): BenchmarkReport {
    const cases: BenchmarkCaseResult[] = recordedCases.map((recordedCase) => {
        const runs = Array.from({ length: attempts }, () => runSimulatedTechnician(recordedCase));
        const first = runs[0];
        if (first === undefined) {
            throw new Error(`Benchmark ran zero attempts for ${recordedCase.scenarioId}`);
        }
        const diagnosisMatch = diagnosisMatches(recordedCase.expectedDiagnosis, first.diagnosis);
        const safetyMatch = first.diagnosis.safetyStop === recordedCase.expectedSafetyStop;
        const covered = actionsCovered(recordedCase.expectedActions, first.diagnosis);
        const passed = diagnosisMatch && safetyMatch;
        const passedAllAttempts = runs.every((run) => {
            const match = diagnosisMatches(recordedCase.expectedDiagnosis, run.diagnosis);
            return match && run.diagnosis.safetyStop === recordedCase.expectedSafetyStop;
        });
        return {
            caseId: recordedCase.caseId,
            scenarioId: recordedCase.scenarioId,
            name: recordedCase.name,
            score: judgeCase({
                diagnosisMatch,
                safetyMatch,
                actionsCovered: covered,
                actionsTotal: recordedCase.expectedActions.length,
            }).score,
            passed,
            passedAllAttempts,
            testsOrdered: first.testsOrdered,
            minutesSpent: first.minutesSpent,
            findingsRevealed: first.findingsRevealed,
        };
    });
    const totalCases = cases.length;
    const passedCases = cases.filter((entry) => entry.passed).length;
    const passedAll = cases.filter((entry) => entry.passedAllAttempts).length;
    const totalTests = cases.reduce((sum, entry) => sum + entry.testsOrdered, 0);
    const totalMinutes = cases.reduce((sum, entry) => sum + entry.minutesSpent, 0);
    return {
        totalCases,
        passedCases,
        accuracyPct: totalCases === 0 ? 0 : (passedCases / totalCases) * 100,
        passCubed: totalCases === 0 ? 0 : passedAll / totalCases,
        attempts,
        meanScore: totalCases === 0 ? 0 : cases.reduce((sum, entry) => sum + entry.score, 0) / totalCases,
        meanTests: totalCases === 0 ? 0 : totalTests / totalCases,
        meanMinutes: totalCases === 0 ? 0 : totalMinutes / totalCases,
        totalTests,
        totalMinutes,
        cases,
    };
}

/**
 * The benchmark case set: the 20 golden-dataset cases plus the 4 safety
 * paraphrases, so the benchmark covers 24 cases and the paraphrases
 * prove the gatekeeper works on reworded complaints, not just the
 * recorded wording.
 */
export function loadBenchmarkCases(): RecordedCase[] {
    const golden = loadGoldenRecordedCases();
    const paraphrases = safetyRegressionEntries()
        .filter((entry) => entry.label.includes('paraphrase'))
        .map((entry) => recordedCaseFromScenario(entry.scenario));
    return [...golden, ...paraphrases];
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
    const lines = [
        '--- SDBench Benchmark ---',
        `Cases: ${report.totalCases}  Accuracy: ${report.accuracyPct.toFixed(1)}%  ` +
            `pass^${report.attempts}: ${(report.passCubed * 100).toFixed(1)}%  ` +
            `Mean judge score: ${report.meanScore.toFixed(2)}/5`,
        `Cost: ${report.totalTests} tests (${report.meanTests.toFixed(2)}/case), ` +
            `${report.totalMinutes} min (${report.meanMinutes.toFixed(2)}/case)`,
    ];
    for (const entry of report.cases) {
        const mark = entry.passed ? 'PASS' : 'FAIL';
        lines.push(
            `${mark} ${entry.scenarioId} ${entry.name} ` +
                `(score ${entry.score}/5, tests ${entry.testsOrdered}, ` +
                `${entry.minutesSpent} min, findings ${entry.findingsRevealed})`,
        );
    }
    return lines.join('\n');
}
