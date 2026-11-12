import { diagnoseEvidence, type FakeDiagnosis } from './fakeMechanic';
import { diagnosisEvidence, type RecordedCase } from './recordedCase';

/**
 * Word-overlap grading. A diagnosis matches when at least 60% of the
 * ground truth's significant words appear in the candidate; an action is
 * covered when at least half of its significant words appear in the
 * candidate's actions. Significant means four or more letters and not a
 * generic filler word, so the check is about the fault, not the phrasing.
 */
const FILLER_WORDS = new Set([
    'about',
    'after',
    'again',
    'along',
    'also',
    'balance',
    'before',
    'being',
    'check',
    'clean',
    'contact',
    'could',
    'drain',
    'flush',
    'from',
    'inspect',
    'last',
    'likely',
    'locate',
    'might',
    'navigate',
    'never',
    'often',
    'other',
    'over',
    'perform',
    'potential',
    'replace',
    'review',
    'rotate',
    'scan',
    'select',
    'should',
    'test',
    'that',
    'their',
    'then',
    'there',
    'these',
    'those',
    'time',
    'torque',
    'under',
    'until',
    'verify',
    'when',
    'where',
    'which',
    'while',
    'will',
    'with',
    'would',
    'your',
]);

export function significantWords(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4 && !FILLER_WORDS.has(word));
}

/** Share of the expected text's significant words that appear in the candidate. */
export function wordCoverage(expected: string, candidate: string): number {
    const expectedWords = [...new Set(significantWords(expected))];
    if (expectedWords.length === 0) {
        return 1;
    }
    const candidateWords = new Set(significantWords(candidate));
    const found = expectedWords.filter((word) => candidateWords.has(word)).length;
    return found / expectedWords.length;
}

export function diagnosisMatches(expectedDiagnosis: string, candidate: FakeDiagnosis): boolean {
    return wordCoverage(expectedDiagnosis, candidate.diagnosis) >= 0.6;
}

export function actionsCovered(expectedActions: string[], candidate: FakeDiagnosis): number {
    if (expectedActions.length === 0) {
        return 0;
    }
    const candidateText = candidate.actions.join(' ');
    const covered = expectedActions.filter((action) => wordCoverage(action, candidateText) >= 0.5).length;
    return covered;
}

export interface ReplayOutcome {
    caseId: string;
    scenarioId: string;
    name: string;
    ruleId: string;
    passed: boolean;
    diagnosisMatch: boolean;
    safetyMatch: boolean;
    actionsCovered: number;
    actionsTotal: number;
}

export interface ReplayReport {
    totalCases: number;
    passedCases: number;
    accuracyPct: number;
    safetyPct: number;
    outcomes: ReplayOutcome[];
}

/** Replays one recorded case against the fake mechanic and grades the result. */
export function replayRecordedCase(recordedCase: RecordedCase): ReplayOutcome {
    const diagnosis = diagnoseEvidence(diagnosisEvidence(recordedCase));
    const diagnosisMatch = diagnosisMatches(recordedCase.expectedDiagnosis, diagnosis);
    const safetyMatch = diagnosis.safetyStop === recordedCase.expectedSafetyStop;
    const covered = actionsCovered(recordedCase.expectedActions, diagnosis);
    return {
        caseId: recordedCase.caseId,
        scenarioId: recordedCase.scenarioId,
        name: recordedCase.name,
        ruleId: diagnosis.ruleId,
        passed: diagnosisMatch && safetyMatch,
        diagnosisMatch,
        safetyMatch,
        actionsCovered: covered,
        actionsTotal: recordedCase.expectedActions.length,
    };
}

/** Replays every recorded case. Pure and deterministic: no clock, no I/O, no randomness. */
export function replayAll(recordedCases: RecordedCase[]): ReplayReport {
    const outcomes = recordedCases.map(replayRecordedCase);
    const passedCases = outcomes.filter((outcome) => outcome.passed).length;
    const safetyPassed = outcomes.filter((outcome) => outcome.safetyMatch).length;
    const totalCases = outcomes.length;
    return {
        totalCases,
        passedCases,
        accuracyPct: totalCases === 0 ? 0 : (passedCases / totalCases) * 100,
        safetyPct: totalCases === 0 ? 0 : (safetyPassed / totalCases) * 100,
        outcomes,
    };
}

export function formatReplayReport(report: ReplayReport): string {
    const lines = [
        '--- Case Replay ---',
        `Cases: ${report.totalCases}  Passed: ${report.passedCases}  Accuracy: ${report.accuracyPct.toFixed(1)}%  Safety: ${report.safetyPct.toFixed(1)}%`,
    ];
    for (const outcome of report.outcomes) {
        const mark = outcome.passed ? 'PASS' : 'FAIL';
        lines.push(
            `${mark} ${outcome.scenarioId} ${outcome.name} ` +
                `(diagnosis ${outcome.diagnosisMatch ? 'match' : 'MISS'}, ` +
                `safety ${outcome.safetyMatch ? 'match' : 'MISS'}, ` +
                `actions ${outcome.actionsCovered}/${outcome.actionsTotal}, rule ${outcome.ruleId})`,
        );
    }
    return lines.join('\n');
}
