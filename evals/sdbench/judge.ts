/**
 * Deterministic judge: scores a finished case 1-5 on a fixed rubric.
 * No model is involved, so the same outcome always scores the same.
 * 5 is a complete case, 3 is a correct diagnosis with the stop right
 * but thin actions, 1 is wrong on both diagnosis and safety.
 */

export interface JudgeInput {
    diagnosisMatch: boolean;
    safetyMatch: boolean;
    actionsCovered: number;
    actionsTotal: number;
}

export interface JudgeScore {
    score: number;
    rationale: string;
}

export function judgeCase(input: JudgeInput): JudgeScore {
    const { diagnosisMatch, safetyMatch, actionsCovered, actionsTotal } = input;
    if (diagnosisMatch && safetyMatch && actionsCovered >= actionsTotal) {
        return { score: 5, rationale: 'Correct diagnosis, correct safety stop, all required actions covered.' };
    }
    if (diagnosisMatch && safetyMatch && actionsCovered * 2 >= actionsTotal) {
        return {
            score: 4,
            rationale: 'Correct diagnosis and safety stop, at least half the required actions covered.',
        };
    }
    if (diagnosisMatch && safetyMatch) {
        return {
            score: 3,
            rationale: 'Correct diagnosis and safety stop, fewer than half the required actions covered.',
        };
    }
    if (diagnosisMatch || safetyMatch) {
        return {
            score: 2,
            rationale: diagnosisMatch
                ? 'Correct diagnosis but the safety stop was wrong.'
                : 'Safety stop right but the diagnosis was wrong.',
        };
    }
    return { score: 1, rationale: 'Diagnosis wrong and safety stop wrong.' };
}
