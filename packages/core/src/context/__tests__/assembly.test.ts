import { describe, it, expect } from 'vitest';
import { SHARED_CONFIG } from '../../config';
import {
    assembleModelCall,
    buildFixedSystemPrompt,
    capToolResults,
    estimateTokenCount,
    renderModelCallText,
} from '../assembly';
import { buildLedger, buildTurns } from './ledgerFixtures';

describe('buildFixedSystemPrompt', () => {
    it('is identical across cases and carries no per-case values', () => {
        const first = buildLedger(5);
        const second = buildLedger(7);
        const promptForFirst = buildFixedSystemPrompt();
        expect(promptForFirst).toBe(buildFixedSystemPrompt());
        expect(promptForFirst).toContain('Senior Master Technician');
        expect(promptForFirst).not.toContain(first.caseRecord.id);
        expect(promptForFirst).not.toContain(second.caseRecord.id);
        expect(promptForFirst).not.toContain('vehicle-1');
    });
});

describe('estimateTokenCount', () => {
    it('estimates four characters per token and zero for empty text', () => {
        expect(estimateTokenCount('')).toBe(0);
        expect(estimateTokenCount('abcdefgh')).toBe(2);
        expect(estimateTokenCount('abcdefghi')).toBe(3);
    });
});

describe('capToolResults', () => {
    it('keeps tool results within ~30% of the window, newest first', () => {
        const windowTokens = 1000;
        const budget = Math.floor(windowTokens * SHARED_CONFIG.CONTEXT.TOOL_RESULT_WINDOW_SHARE);
        expect(budget).toBe(300);
        const toolResults = [
            { name: 'search-old', output: 'x'.repeat(4000) },
            { name: 'search-mid', output: 'y'.repeat(4000) },
            { name: 'search-new', output: 'z'.repeat(400) },
        ];
        const capped = capToolResults(toolResults, windowTokens);
        expect(capped.tokenEstimate).toBeLessThanOrEqual(budget);
        // The newest result fits whole; the middle one is truncated to the remainder.
        expect(capped.kept.map((result) => result.name)).toEqual(['search-mid', 'search-new']);
        expect(capped.kept.find((result) => result.name === 'search-new')?.output).toBe('z'.repeat(400));
        expect(capped.truncatedNames).toEqual(['search-mid']);
        expect(capped.droppedNames).toEqual(['search-old']);
    });

    it('keeps everything when it fits the budget', () => {
        const capped = capToolResults(
            [
                { name: 'a', output: 'short' },
                { name: 'b', output: 'short' },
            ],
            1000,
        );
        expect(capped.kept).toHaveLength(2);
        expect(capped.truncatedNames).toEqual([]);
        expect(capped.droppedNames).toEqual([]);
    });

    it('rejects a non-positive window', () => {
        expect(() => capToolResults([], 0)).toThrow();
        expect(() => capToolResults([], -100)).toThrow();
    });
});

describe('assembleModelCall', () => {
    it('builds the call from fixed prompt, snapshot, catalog, and recent turns', () => {
        const { caseRecord, entries } = buildLedger(10);
        const assembled = assembleModelCall({
            caseRecord,
            entries,
            recentTurns: buildTurns(4),
            toolResults: [{ name: 'search', output: 'recall found' }],
            windowTokens: 1000,
            loadedSkill: null,
        });
        expect(assembled.systemPrompt).toBe(buildFixedSystemPrompt());
        expect(assembled.snapshot).toContain(`CASE ${caseRecord.id}`);
        expect(assembled.snapshot).toContain('observation-fact-2');
        expect(assembled.skillsCatalog).toContain('fuel-pressure-test');
        expect(assembled.loadedSkill).toBeNull();
        expect(assembled.turns).toHaveLength(4);
        expect(assembled.omittedTurnCount).toBe(0);
        expect(assembled.toolResults.kept).toHaveLength(1);
    });

    it('keeps only the most recent turns and counts the omitted ones', () => {
        const { caseRecord, entries } = buildLedger(3);
        const turns = buildTurns(SHARED_CONFIG.CONTEXT.RECENT_TURN_LIMIT + 5);
        const assembled = assembleModelCall({
            caseRecord,
            entries,
            recentTurns: turns,
            toolResults: [],
            windowTokens: 1000,
            loadedSkill: null,
        });
        expect(assembled.turns).toHaveLength(SHARED_CONFIG.CONTEXT.RECENT_TURN_LIMIT);
        expect(assembled.turns[0].content).toContain('turn-5');
        expect(assembled.omittedTurnCount).toBe(5);
    });

    it('rejects a non-positive window', () => {
        const { caseRecord, entries } = buildLedger(1);
        expect(() =>
            assembleModelCall({
                caseRecord,
                entries,
                recentTurns: [],
                toolResults: [],
                windowTokens: 0,
                loadedSkill: null,
            }),
        ).toThrow();
    });
});

describe('renderModelCallText', () => {
    it('renders the snapshot verbatim, once, with the loaded skill body', () => {
        const { caseRecord, entries } = buildLedger(10);
        const assembled = assembleModelCall({
            caseRecord,
            entries,
            recentTurns: buildTurns(2),
            toolResults: [],
            windowTokens: 1000,
            loadedSkill: { name: 'fuel-pressure-test', body: 'LOADED SKILL BODY' },
        });
        const text = renderModelCallText(assembled);
        expect(text).toContain(assembled.snapshot);
        expect(text.split(assembled.snapshot).length).toBe(2);
        expect(text).toContain('LOADED PROCEDURE: fuel-pressure-test');
        expect(text).toContain('LOADED SKILL BODY');
        expect(text).toContain('USER: turn-0 user message');
    });

    it('omits the loaded-procedure section when no skill was chosen', () => {
        const { caseRecord, entries } = buildLedger(2);
        const assembled = assembleModelCall({
            caseRecord,
            entries,
            recentTurns: [],
            toolResults: [],
            windowTokens: 1000,
            loadedSkill: null,
        });
        expect(renderModelCallText(assembled)).not.toContain('LOADED PROCEDURE');
    });
});
