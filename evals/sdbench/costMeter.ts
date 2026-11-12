/** One question costs one virtual minute; one test costs five. Virtual minutes keep the cost meter deterministic: no wall clock, no flake. */
export const QUESTION_MINUTES = 1;
export const TEST_MINUTES = 5;

export interface CostTotals {
    questions: number;
    tests: number;
    minutes: number;
}

/**
 * Cost meter for the benchmark: counts the questions asked and tests
 * ordered, plus the virtual minutes they took. The meter only counts;
 * the simulated technician decides what to ask and order.
 */
export class CostMeter {
    private questionCount = 0;
    private testCount = 0;
    private minutesSpent = 0;

    recordQuestion(minutes: number = QUESTION_MINUTES): void {
        this.questionCount += 1;
        this.minutesSpent += minutes;
    }

    recordTest(minutes: number = TEST_MINUTES): void {
        this.testCount += 1;
        this.minutesSpent += minutes;
    }

    totals(): CostTotals {
        return { questions: this.questionCount, tests: this.testCount, minutes: this.minutesSpent };
    }
}
