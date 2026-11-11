import { describe, expect, it } from 'vitest';
import { loadCostRates } from './fixtures';
import {
    normalizeSpoken,
    percentile,
    renderResultsTable,
    scoreRun,
    scoreTurn,
    targetHeard,
    type BakeoffTurnObservation,
} from './scorer';
import type { BakeoffTurn } from './fixtures';

function turn(overrides: Partial<BakeoffTurn> = {}): BakeoffTurn {
    return {
        id: 'T01',
        category: 'code',
        prompt: 'The scanner shows P zero one seven one. What does it mean?',
        noiseBed: null,
        expectedTargets: ['P0171'],
        expectedKeywords: [],
        expectedTool: null,
        interrupt: null,
        clip: null,
        notes: '',
        ...overrides,
    };
}

function observation(overrides: Partial<BakeoffTurnObservation> = {}): BakeoffTurnObservation {
    return {
        turnId: 'T01',
        transcript: '',
        toolCalls: [],
        spokeWhileToolRan: null,
        timeToFirstAudioMs: null,
        interruptStopMs: null,
        crackles: 0,
        dropouts: 0,
        status: 'scored',
        ...overrides,
    };
}

describe('normalizeSpoken', () => {
    it('collapses spoken digits to the written code', () => {
        expect(normalizeSpoken('P zero one seven one')).toBe('P0171');
        expect(normalizeSpoken('P0171')).toBe('P0171');
        expect(normalizeSpoken('p0171')).toBe('P0171');
    });

    it('collapses a spoken VIN digit by digit', () => {
        expect(normalizeSpoken('one h g b h four one j x m n one zero nine one eight six')).toBe('1HGBH41JXMN109186');
    });

    it('collapses spoken decimals', () => {
        expect(normalizeSpoken('zero point four five volts')).toBe('045VOLTS');
        expect(normalizeSpoken('0.45 volts')).toBe('045VOLTS');
    });
});

describe('targetHeard', () => {
    it('hears a code spoken digit by digit', () => {
        expect(targetHeard('That is P zero one seven one, a lean code.', 'P0171')).toBe(true);
        expect(targetHeard('That is P zero one seven four, a lean code.', 'P0171')).toBe(false);
    });

    it('does not count a shorter number inside a longer one', () => {
        expect(targetHeard('The reading is 0.45 volts.', '45')).toBe(false);
        expect(targetHeard('Hold it at 25000 RPM.', '2500')).toBe(false);
        expect(targetHeard('Hold it at 2500 RPM.', '2500')).toBe(true);
    });

    it('hears a VIN spoken aloud', () => {
        expect(
            targetHeard('The VIN is one h g b h four one j x m n one zero nine one eight six.', '1HGBH41JXMN109186'),
        ).toBe(true);
    });
});

describe('scoreTurn', () => {
    it('scores exact matches and misses per target', () => {
        const scored = scoreTurn(
            turn({ expectedTargets: ['P0171', 'P0174'] }),
            observation({ transcript: 'P0171 and P zero one seven four, both lean codes.' }),
        );
        expect(scored.targetsHeard).toBe(2);
        expect(scored.exactMatch).toBe(true);
        const missed = scoreTurn(
            turn({ expectedTargets: ['P0171', 'P0174'] }),
            observation({ transcript: 'P0171 is a lean code.' }),
        );
        expect(missed.targetsHeard).toBe(1);
        expect(missed.exactMatch).toBe(false);
    });

    it('checks tool name and argument contents', () => {
        const guided = turn({
            category: 'guided-test',
            expectedTargets: [],
            expectedTool: { name: 'start_video_stream', argsContain: { component: 'belt' } },
        });
        expect(
            scoreTurn(
                guided,
                observation({
                    toolCalls: [{ name: 'start_video_stream', args: { component: 'engine belt', reason: 'inspect' } }],
                }),
            ).toolCorrect,
        ).toBe(true);
        expect(
            scoreTurn(
                guided,
                observation({
                    toolCalls: [{ name: 'start_video_stream', args: { component: 'brake rotor', reason: 'inspect' } }],
                }),
            ).toolCorrect,
        ).toBe(false);
        expect(scoreTurn(guided, observation({ toolCalls: [] })).toolCorrect).toBe(false);
    });

    it('leaves toolCorrect null when the turn expects no tool', () => {
        expect(scoreTurn(turn(), observation()).toolCorrect).toBe(null);
    });
});

describe('percentile', () => {
    it('returns null for an empty set and nearest-rank values otherwise', () => {
        expect(percentile([], 50)).toBe(null);
        expect(percentile([300, 100, 200], 50)).toBe(200);
        expect(percentile([100, 200, 300], 95)).toBe(300);
    });
});

describe('scoreRun', () => {
    it('aggregates accuracy, latency, tool and cost across turns', () => {
        const turns = [
            turn({ id: 'T01', expectedTargets: ['P0171'] }),
            turn({ id: 'T02', noiseBed: 'impact-gun', expectedTargets: ['P0300'] }),
            turn({
                id: 'T03',
                category: 'guided-test',
                expectedTargets: [],
                expectedTool: { name: 'start_video_stream', argsContain: { component: 'belt' } },
            }),
        ];
        const observations = [
            observation({ turnId: 'T01', transcript: 'P0171', timeToFirstAudioMs: 800 }),
            observation({ turnId: 'T02', transcript: 'P0300', timeToFirstAudioMs: 1200, crackles: 2 }),
            observation({
                turnId: 'T03',
                transcript: 'Looking at the belt now.',
                timeToFirstAudioMs: 900,
                toolCalls: [{ name: 'start_video_stream', args: { component: 'belt', reason: 'wear' } }],
                spokeWhileToolRan: true,
            }),
        ];
        const rates = loadCostRates(new URL('./cost-rates.json', import.meta.url).pathname);
        const run = scoreRun(
            'gemini',
            turns,
            observations,
            { inputAudioMinutes: 5, outputAudioMinutes: 5, outputChars: 1000, sessionMinutes: 10 },
            rates,
        );
        expect(run.accuracy).toBe(1);
        expect(run.cleanAccuracy).toBe(1);
        expect(run.noisyAccuracy).toBe(1);
        expect(run.timeToFirstAudioP50Ms).toBe(900);
        expect(run.timeToFirstAudioP95Ms).toBe(1200);
        expect(run.toolAccuracy).toBe(1);
        expect(run.toolTurnsSpokeWhileRunning).toBe(1);
        expect(run.crackles).toBe(2);
        expect(run.costPer10MinUsd).toBeCloseTo(run.sessionCostUsd, 10);
        expect(renderResultsTable(run)).toContain('Bake-off run: gemini');
        expect(renderResultsTable(run)).toContain('100.0%');
    });

    it('skips missing-asset turns instead of scoring them', () => {
        const run = scoreRun(
            'grok',
            [turn({ id: 'T01' }), turn({ id: 'T02', noiseBed: 'impact-gun' })],
            [
                observation({ turnId: 'T01', transcript: 'P0171' }),
                observation({ turnId: 'T02', status: 'missing-asset', error: 'noise/impact-gun.wav not found' }),
            ],
            { inputAudioMinutes: 1, outputAudioMinutes: 1, outputChars: 10, sessionMinutes: 1 },
            loadCostRates(new URL('./cost-rates.json', import.meta.url).pathname),
        );
        expect(run.turnsScored).toBe(1);
        expect(run.turnsSkipped).toBe(1);
        expect(run.accuracy).toBe(1);
    });
});
