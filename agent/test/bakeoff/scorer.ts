import { estimateCostUsd, type BakeoffUsage, type CostRates } from './fixtures';
import type { BakeoffTurn } from './fixtures';
import type { VoiceProviderId } from '../../src/voice/provider';

/**
 * Pure scoring for the LM-40 noisy-shop voice bake-off. Everything here runs
 * on recorded turn observations, so the scorer has unit tests and never needs
 * a live room, a microphone, or API keys. The live runner
 * (agent/test/bakeoff/runner.ts) only collects observations and writes them
 * out; this module turns them into the results table.
 */

/** Spoken digit words, so "P zero one seven one" matches target "P0171". */
const DIGIT_WORDS: Record<string, string> = {
    zero: '0',
    oh: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
};

/**
 * Normalises agent reply text and an expected target to the same alphabet:
 * spoken digit words become digits, "point" becomes ".", everything else
 * keeps only letters and digits. "P zero one seven one", "P0171" and
 * "p0171" all normalise to "P0171"; "0.45 volts" and "zero point four five"
 * both normalise to "045" (the decimal point is dropped on both sides, so a
 * "0.45" reply still matches a "0.45" target and a "45" reply does not).
 */
export function normalizeSpoken(text: string): string {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .map((word) => DIGIT_WORDS[word] ?? (word === 'point' ? '.' : word))
        .join('')
        .replace(/\./g, '')
        .toUpperCase();
}

/** Exact-match check: does the agent's reply contain the expected code, VIN, or number? */
export function targetHeard(transcript: string, target: string): boolean {
    const heard = normalizeSpoken(transcript);
    const wanted = normalizeSpoken(target);
    if (wanted.length === 0) return false;
    // A bare number must not match inside a longer digit run: "45" is not a
    // hearing of "0.45", and "2500" is not a hearing of "25000".
    let from = 0;
    for (;;) {
        const at = heard.indexOf(wanted, from);
        if (at === -1) return false;
        const before = at === 0 ? '' : heard[at - 1];
        const after = at + wanted.length >= heard.length ? '' : heard[at + wanted.length];
        const digitBefore = before >= '0' && before <= '9';
        const digitAfter = after >= '0' && after <= '9';
        if (!digitBefore && !digitAfter) return true;
        from = at + 1;
    }
}

/** One tool call the runner observed on the room's data channel. */
export interface ObservedToolCall {
    name: string;
    args: Record<string, unknown>;
}

/** Everything the runner measured for one turn. */
export interface BakeoffTurnObservation {
    turnId: string;
    /** Agent reply text, from the transcript mirror. Empty when the agent never replied. */
    transcript: string;
    toolCalls: ObservedToolCall[];
    /** True when the agent kept speaking after a tool call started. Null when no tool was called. */
    spokeWhileToolRan: boolean | null;
    /** Milliseconds from the end of the spoken prompt to the first audible agent audio. Null if it never spoke. */
    timeToFirstAudioMs: number | null;
    /** Milliseconds from the end of the interrupt phrase to the last audible agent audio. Null when no interrupt. */
    interruptStopMs: number | null;
    /** Clipped or spiking frames in the agent's audio (heuristic, see runner). */
    crackles: number;
    /** Silent gaps over 150 ms mid-utterance in the agent's audio. */
    dropouts: number;
    status: 'scored' | 'missing-asset' | 'no-reply' | 'error';
    error?: string;
}

export interface BakeoffTurnScore {
    turnId: string;
    category: BakeoffTurn['category'];
    noiseBed: string | null;
    targetsHeard: number;
    targetsTotal: number;
    /** Every expected target was heard. */
    exactMatch: boolean;
    keywordsHeard: number;
    keywordsTotal: number;
    /** Null when the turn expects no tool call. */
    toolCorrect: boolean | null;
    spokeWhileToolRan: boolean | null;
    timeToFirstAudioMs: number | null;
    interruptStopMs: number | null;
    crackles: number;
    dropouts: number;
    status: BakeoffTurnObservation['status'];
}

/** Scores one turn's observation against the fixture's expectations. */
export function scoreTurn(turn: BakeoffTurn, observation: BakeoffTurnObservation): BakeoffTurnScore {
    const targetsHeard = turn.expectedTargets.filter((target) => targetHeard(observation.transcript, target)).length;
    const keywordsHeard = turn.expectedKeywords.filter((keyword) => targetHeard(observation.transcript, keyword)).length;
    let toolCorrect: boolean | null = null;
    if (turn.expectedTool) {
        const call = observation.toolCalls.find((candidate) => candidate.name === turn.expectedTool?.name);
        toolCorrect =
            call !== undefined &&
            Object.entries(turn.expectedTool.argsContain).every(([key, wanted]) => {
                const actual = call.args[key];
                return (
                    typeof actual === 'string' && actual.toLowerCase().includes(String(wanted).toLowerCase())
                );
            });
    }
    return {
        turnId: turn.id,
        category: turn.category,
        noiseBed: turn.noiseBed,
        targetsHeard,
        targetsTotal: turn.expectedTargets.length,
        exactMatch: turn.expectedTargets.length > 0 ? targetsHeard === turn.expectedTargets.length : true,
        keywordsHeard,
        keywordsTotal: turn.expectedKeywords.length,
        toolCorrect,
        spokeWhileToolRan: observation.spokeWhileToolRan,
        timeToFirstAudioMs: observation.timeToFirstAudioMs,
        interruptStopMs: observation.interruptStopMs,
        crackles: observation.crackles,
        dropouts: observation.dropouts,
        status: observation.status,
    };
}

/** Nearest-rank percentile. Returns null for an empty set. */
export function percentile(values: number[], rank: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1))];
}

export interface BakeoffRunScore {
    provider: VoiceProviderId;
    runAt: string;
    turnsScored: number;
    turnsSkipped: number;
    /** Targets heard / targets expected, across scored turns. */
    accuracy: number | null;
    cleanAccuracy: number | null;
    noisyAccuracy: number | null;
    perCategoryAccuracy: Record<string, number | null>;
    timeToFirstAudioP50Ms: number | null;
    timeToFirstAudioP95Ms: number | null;
    interruptStopP50Ms: number | null;
    toolAccuracy: number | null;
    toolTurnsSpokeWhileRunning: number;
    toolTurnsTotal: number;
    crackles: number;
    dropouts: number;
    /** What the run actually cost, from measured usage and the rates file. */
    sessionCostUsd: number;
    /** Session cost scaled to a 10-minute session, for comparing providers. Null when the session length is unknown. */
    costPer10MinUsd: number | null;
    sessionMinutes: number;
    turnScores: BakeoffTurnScore[];
}

/** Aggregates per-turn scores into one run score. */
export function scoreRun(
    provider: VoiceProviderId,
    turns: BakeoffTurn[],
    observations: BakeoffTurnObservation[],
    usage: BakeoffUsage,
    rates: CostRates,
): BakeoffRunScore {
    const byId = new Map(observations.map((observation) => [observation.turnId, observation]));
    const turnScores = turns.map((turn) => {
        const observation = byId.get(turn.id);
        if (!observation) {
            return scoreTurn(turn, {
                turnId: turn.id,
                transcript: '',
                toolCalls: [],
                spokeWhileToolRan: null,
                timeToFirstAudioMs: null,
                interruptStopMs: null,
                crackles: 0,
                dropouts: 0,
                status: 'error',
                error: 'No observation recorded for this turn',
            });
        }
        return scoreTurn(turn, observation);
    });
    const scored = turnScores.filter((score) => score.status === 'scored');
    const accuracyOf = (scores: BakeoffTurnScore[]): number | null => {
        const total = scores.reduce((sum, score) => sum + score.targetsTotal, 0);
        if (total === 0) return null;
        return scores.reduce((sum, score) => sum + score.targetsHeard, 0) / total;
    };
    const toolScores = scored.filter((score) => score.toolCorrect !== null);
    const sessionCostUsd = estimateCostUsd(provider, usage, rates);
    return {
        provider,
        runAt: new Date().toISOString(),
        turnsScored: scored.length,
        turnsSkipped: turnScores.length - scored.length,
        accuracy: accuracyOf(scored),
        cleanAccuracy: accuracyOf(scored.filter((score) => score.noiseBed === null)),
        noisyAccuracy: accuracyOf(scored.filter((score) => score.noiseBed !== null)),
        perCategoryAccuracy: Object.fromEntries(
            ['code', 'reading', 'interruption', 'guided-test', 'vision'].map((category) => [
                category,
                accuracyOf(scored.filter((score) => score.category === category)),
            ]),
        ),
        timeToFirstAudioP50Ms: percentile(
            scored.map((score) => score.timeToFirstAudioMs).filter((ms): ms is number => ms !== null),
            50,
        ),
        timeToFirstAudioP95Ms: percentile(
            scored.map((score) => score.timeToFirstAudioMs).filter((ms): ms is number => ms !== null),
            95,
        ),
        interruptStopP50Ms: percentile(
            scored.map((score) => score.interruptStopMs).filter((ms): ms is number => ms !== null),
            50,
        ),
        toolAccuracy:
            toolScores.length === 0
                ? null
                : toolScores.filter((score) => score.toolCorrect).length / toolScores.length,
        toolTurnsSpokeWhileRunning: toolScores.filter((score) => score.spokeWhileToolRan === true).length,
        toolTurnsTotal: toolScores.length,
        crackles: scored.reduce((sum, score) => sum + score.crackles, 0),
        dropouts: scored.reduce((sum, score) => sum + score.dropouts, 0),
        sessionCostUsd,
        costPer10MinUsd: usage.sessionMinutes > 0 ? (sessionCostUsd / usage.sessionMinutes) * 10 : null,
        sessionMinutes: usage.sessionMinutes,
        turnScores,
    };
}

function percent(value: number | null): string {
    return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function millis(value: number | null): string {
    return value === null ? 'n/a' : `${value} ms`;
}

function dollars(value: number | null): string {
    return value === null ? 'n/a' : `$${value.toFixed(2)}`;
}

/** Renders one run score as the results table the issue asks for. */
export function renderResultsTable(score: BakeoffRunScore): string {
    const lines = [
        `## Bake-off run: ${score.provider} (${score.runAt})`,
        '',
        `Scored ${score.turnsScored} turns, skipped ${score.turnsSkipped}. Session length ${score.sessionMinutes.toFixed(1)} minutes.`,
        '',
        '| Metric | Result |',
        '| --- | --- |',
        `| Hears it right (exact-match accuracy) | ${percent(score.accuracy)} |`,
        `| Hears it right, clean audio | ${percent(score.cleanAccuracy)} |`,
        `| Hears it right, with shop noise | ${percent(score.noisyAccuracy)} |`,
        `| Time to first audio (p50) | ${millis(score.timeToFirstAudioP50Ms)} |`,
        `| Time to first audio (p95) | ${millis(score.timeToFirstAudioP95Ms)} |`,
        `| Stops after interruption (p50) | ${millis(score.interruptStopP50Ms)} |`,
        `| Tool calls correct | ${percent(score.toolAccuracy)} |`,
        `| Kept talking while a tool ran | ${score.toolTurnsSpokeWhileRunning} of ${score.toolTurnsTotal} tool turns |`,
        `| Audio crackles | ${score.crackles} |`,
        `| Audio dropouts | ${score.dropouts} |`,
        `| Session cost | ${dollars(score.sessionCostUsd)} |`,
        `| Cost per 10-minute session | ${dollars(score.costPer10MinUsd)} |`,
        '',
        '| Category | Accuracy |',
        '| --- | --- |',
        ...Object.entries(score.perCategoryAccuracy).map(([category, value]) => `| ${category} | ${percent(value)} |`),
        '',
        '| Turn | Category | Noise | Targets | Exact | TTFA | Tool |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        ...score.turnScores.map(
            (turn) =>
                `| ${turn.turnId} | ${turn.category} | ${turn.noiseBed ?? 'clean'} | ${turn.targetsHeard}/${turn.targetsTotal} | ${turn.exactMatch ? 'yes' : 'no'} | ${millis(turn.timeToFirstAudioMs)} | ${turn.toolCorrect === null ? 'n/a' : turn.toolCorrect ? 'correct' : 'wrong'} |`,
        ),
        '',
    ];
    return lines.join('\n');
}
