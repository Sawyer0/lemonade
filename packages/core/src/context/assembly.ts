import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import { SHARED_CONFIG } from '../config';
import { SystemPrompts } from '../prompts/SystemPrompts';
import type { Case, LedgerEntry } from '../types/case';
import type { ContextTurn, LoadedProcedureSkill, ToolResultEntry } from './types';
import { renderCaseSnapshot } from './snapshot';
import { PROCEDURE_SKILLS_CATALOG, renderSkillsCatalog } from './catalog';

/**
 * Model-call assembly (LM-21). Every model call is built from the same
 * parts, in this order: a fixed system prompt, the case-facts snapshot
 * rendered from the ledger, the short procedure-skills catalog (plus the
 * one loaded skill body, when a test was chosen), and the recent turns.
 * Tool results ride alongside, capped at a share of the context window.
 */

// Fixed system prompt, built once: identity + prime directives + diagnostic
// protocol. It carries no per-case values, so it is cacheable across calls
// and cases; buildFixedSystemPrompt returns this same string every time.
export const FIXED_SYSTEM_PROMPT: string = [
    SystemPrompts.identity(),
    SystemPrompts.primeDirectives(),
    SystemPrompts.diagnosticProtocol(),
].join('\n\n');

export function buildFixedSystemPrompt(): string {
    return FIXED_SYSTEM_PROMPT;
}

/**
 * Character-based token estimate (chars per token from central config).
 * Core has no tokenizer; callers with a real counter may substitute their
 * own count when enforcing a hard provider limit.
 */
export function estimateTokenCount(text: string): number {
    if (text.length === 0) {
        return 0;
    }
    return Math.ceil(text.length / SHARED_CONFIG.CONTEXT.ESTIMATED_CHARS_PER_TOKEN);
}

export interface CappedToolResults {
    kept: ReadonlyArray<ToolResultEntry>;
    truncatedNames: ReadonlyArray<string>;
    droppedNames: ReadonlyArray<string>;
    tokenEstimate: number;
}

const TRUNCATION_MARKER = '…[tool output truncated to fit the tool-result budget]';

/**
 * Caps tool results to a share of the context window (central config).
 * Newest results are kept whole first; the oldest kept result is truncated
 * to the remaining budget when it does not fit whole; older results beyond
 * the budget are dropped and named, never silently lost.
 */
export function capToolResults(toolResults: ReadonlyArray<ToolResultEntry>, windowTokens: number): CappedToolResults {
    if (!Number.isFinite(windowTokens) || windowTokens <= 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'windowTokens must be a positive number');
    }
    const budget = Math.floor(windowTokens * SHARED_CONFIG.CONTEXT.TOOL_RESULT_WINDOW_SHARE);
    const keptNewestFirst: ToolResultEntry[] = [];
    const truncatedNames: string[] = [];
    const droppedNames: string[] = [];
    let remaining = budget;
    for (let index = toolResults.length - 1; index >= 0; index--) {
        const entry = toolResults[index];
        const entryTokens = estimateTokenCount(entry.output);
        if (entryTokens <= remaining) {
            keptNewestFirst.unshift(entry);
            remaining -= entryTokens;
            continue;
        }
        if (remaining > 0) {
            // Reserve room for the marker so the truncated result still fits the budget.
            const allowedChars = Math.max(
                0,
                remaining * SHARED_CONFIG.CONTEXT.ESTIMATED_CHARS_PER_TOKEN - TRUNCATION_MARKER.length,
            );
            const truncatedOutput = `${entry.output.slice(0, allowedChars)}${TRUNCATION_MARKER}`;
            keptNewestFirst.unshift({ name: entry.name, output: truncatedOutput });
            truncatedNames.push(entry.name);
        } else {
            droppedNames.push(entry.name);
        }
        for (let dropped = index - 1; dropped >= 0; dropped--) {
            droppedNames.push(toolResults[dropped].name);
        }
        break;
    }
    const tokenEstimate = keptNewestFirst.reduce((total, entry) => total + estimateTokenCount(entry.output), 0);
    return { kept: keptNewestFirst, truncatedNames, droppedNames, tokenEstimate };
}

export interface AssembleModelCallInput {
    caseRecord: Case;
    entries: ReadonlyArray<LedgerEntry>;
    recentTurns: ReadonlyArray<ContextTurn>;
    toolResults: ReadonlyArray<ToolResultEntry>;
    windowTokens: number;
    /** The one loaded skill body, when a test was chosen; null otherwise. */
    loadedSkill: LoadedProcedureSkill | null;
}

export interface AssembledModelCall {
    systemPrompt: string;
    snapshot: string;
    skillsCatalog: string;
    loadedSkill: LoadedProcedureSkill | null;
    turns: ReadonlyArray<ContextTurn>;
    omittedTurnCount: number;
    toolResults: CappedToolResults;
    windowTokens: number;
}

/**
 * Builds one model call. The snapshot is rendered fresh from the ledger
 * entries every time, so it always carries every ledger fact; the system
 * prompt is the fixed cacheable string; only the most recent turns are
 * kept (older turns belong to compaction, never to silent pruning here).
 */
export function assembleModelCall(input: AssembleModelCallInput): AssembledModelCall {
    if (!Number.isFinite(input.windowTokens) || input.windowTokens <= 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'windowTokens must be a positive number');
    }
    const snapshot = renderCaseSnapshot(input.caseRecord, input.entries);
    const capped = capToolResults(input.toolResults, input.windowTokens);
    const turnLimit = SHARED_CONFIG.CONTEXT.RECENT_TURN_LIMIT;
    const turns =
        input.recentTurns.length > turnLimit
            ? input.recentTurns.slice(input.recentTurns.length - turnLimit)
            : input.recentTurns;
    return {
        systemPrompt: buildFixedSystemPrompt(),
        snapshot,
        skillsCatalog: renderSkillsCatalog(PROCEDURE_SKILLS_CATALOG),
        loadedSkill: input.loadedSkill,
        turns,
        omittedTurnCount: input.recentTurns.length - turns.length,
        toolResults: capped,
        windowTokens: input.windowTokens,
    };
}

/**
 * Renders an assembled call as one text prompt, sections in call order:
 * fixed system prompt, case snapshot, skills catalog, loaded skill (when
 * one was chosen), recent turns, capped tool results. The snapshot appears
 * verbatim, never reworded or compressed.
 */
export function renderModelCallText(assembled: AssembledModelCall): string {
    const sections: string[] = [
        assembled.systemPrompt,
        '',
        'CASE FACTS (from the evidence ledger):',
        assembled.snapshot,
        '',
        assembled.skillsCatalog,
    ];
    if (assembled.loadedSkill !== null) {
        sections.push('', `LOADED PROCEDURE: ${assembled.loadedSkill.name}`, assembled.loadedSkill.body);
    }
    if (assembled.turns.length > 0) {
        sections.push('', 'RECENT TURNS:');
        for (const turn of assembled.turns) {
            sections.push(`${turn.role.toUpperCase()}: ${turn.content}`);
        }
    }
    if (assembled.toolResults.kept.length > 0) {
        sections.push('', 'TOOL RESULTS:');
        for (const result of assembled.toolResults.kept) {
            sections.push(`[${result.name}] ${result.output}`);
        }
    }
    return sections.join('\n');
}
