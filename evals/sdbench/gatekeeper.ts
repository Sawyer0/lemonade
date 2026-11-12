import type { RecordedCase } from '../replay/recordedCase';

/**
 * One question the simulated technician can ask the gatekeeper. The
 * keywords are the topics the question is about; the gatekeeper only
 * answers when a keyword touches the case's hidden ground truth.
 */
export interface GatekeeperQuestion {
    id: string;
    text: string;
    keywords: string[];
}

/** One test the simulated technician can order from the gatekeeper. */
export interface GatekeeperTest {
    name: string;
    triggers: string[];
}

/** Fixed question panel, asked in order whenever the known evidence triggers one. */
export const GATEKEEPER_QUESTIONS: GatekeeperQuestion[] = [
    {
        id: 'smell',
        text: 'Is there an unusual smell, and what does it smell like?',
        keywords: ['smell', 'gasoline', 'petrol', 'fuel', 'fumes', 'odor'],
    },
    {
        id: 'sight',
        text: 'Is there anything unusual visible under the hood or around the car?',
        keywords: ['orange', 'cable', 'wire', 'visible', 'exposed', 'loose', 'color'],
    },
    {
        id: 'sound',
        text: 'Is there an unusual sound, and when does it happen?',
        keywords: ['rattle', 'squeal', 'grinding', 'clicking', 'noise', 'humming', 'shakes', 'vibration'],
    },
    {
        id: 'feel',
        text: 'How does the car feel when driving: vibration, pulling, heaviness?',
        keywords: ['shakes', 'vibration', 'heavy', 'steering', 'wobble', 'violently'],
    },
    {
        id: 'fluid',
        text: 'Is there any fluid leaking, a puddle, steam, or a wet patch?',
        keywords: ['leak', 'puddle', 'fluid', 'wet', 'soaked', 'steam'],
    },
    {
        id: 'warning',
        text: 'Are any warning lights on, or any messages on the dash?',
        keywords: ['light', 'battery', 'temperature', 'warning', 'dash', 'message'],
    },
];

/** Fixed test catalog. A test is ordered only when its triggers appear in the known evidence. */
export const GATEKEEPER_TESTS: GatekeeperTest[] = [
    { name: 'fluid-leak-inspection', triggers: ['fuel', 'leak', 'smell', 'puddle', 'gasoline', 'petrol', 'fumes'] },
    { name: 'high-voltage-inspection', triggers: ['orange', 'cable', 'wire', 'voltage', 'electric'] },
    { name: 'charging-system-test', triggers: ['battery', 'light', 'belt', 'alternator'] },
    { name: 'brake-inspection', triggers: ['brake', 'squeal', 'squealing', 'fluid'] },
    { name: 'cooling-system-test', triggers: ['steam', 'temperature', 'overheat', 'coolant'] },
    { name: 'starter-battery-test', triggers: ['clicking', 'start', 'key'] },
    { name: 'tire-balance-check', triggers: ['shakes', 'vibration', 'wobble', 'mph'] },
    { name: 'exhaust-inspection', triggers: ['smoke', 'blue', 'exhaust'] },
    { name: 'steering-inspection', triggers: ['steering', 'heavy', 'turn', 'grinding'] },
    { name: 'transmission-scan', triggers: ['transmission', 'revs', 'slip', 'gear'] },
    { name: 'def-system-check', triggers: ['exhaust', 'fluid', 'def', 'diesel'] },
    { name: 'hybrid-cooling-inspection', triggers: ['hybrid', 'battery', 'cooling', 'fan'] },
    { name: 'sunroof-drain-check', triggers: ['carpet', 'soaked', 'sunroof', 'rain', 'drain'] },
    { name: 'sound-system-check', triggers: ['humming', 'spaceship', 'sound', 'low', 'speed'] },
];

function mentions(text: string, keywords: string[]): boolean {
    const lowered = text.toLowerCase();
    return keywords.some((keyword) => lowered.includes(keyword));
}

/**
 * MAI-DxO style gatekeeper (deterministic stand-in for a model). It holds
 * the true vehicle state: the ground-truth diagnosis stays hidden, and the
 * required actions are the findings, revealed one per relevant query.
 * A query is relevant when one of its keywords appears in the hidden
 * diagnosis; anything else is answered with nothing, so the doctor can
 * only learn what it thought to ask about. Findings are revealed in
 * recorded order, so the same questions always reveal the same findings.
 */
export class CaseGatekeeper {
    private readonly findings: string[];
    private readonly hiddenDiagnosis: string;
    private revealedCount = 0;

    constructor(recordedCase: RecordedCase) {
        this.findings = [...recordedCase.expectedActions];
        this.hiddenDiagnosis = recordedCase.expectedDiagnosis.toLowerCase();
    }

    /** Asks one panel question. Returns the next finding, or nothing when the question is irrelevant. */
    ask(questionId: string): string[] {
        const question = GATEKEEPER_QUESTIONS.find((candidate) => candidate.id === questionId);
        if (question === undefined) {
            throw new Error(`Unknown gatekeeper question: ${questionId}`);
        }
        return this.reveal(question.keywords);
    }

    /** Orders one catalog test. Returns the next finding, or nothing when the test is irrelevant. */
    orderTest(testName: string): string[] {
        const test = GATEKEEPER_TESTS.find((candidate) => candidate.name === testName);
        if (test === undefined) {
            throw new Error(`Unknown gatekeeper test: ${testName}`);
        }
        return this.reveal(test.triggers);
    }

    /** How many findings have been revealed so far. */
    revealedFindings(): number {
        return this.revealedCount;
    }

    private reveal(keywords: string[]): string[] {
        if (!mentions(this.hiddenDiagnosis, keywords) || this.revealedCount >= this.findings.length) {
            return [];
        }
        const finding = this.findings[this.revealedCount];
        this.revealedCount += 1;
        return finding === undefined ? [] : [finding];
    }
}
