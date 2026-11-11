import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import { SHARED_CONFIG } from '../config';
import type { ContextTurn, ToolResultEntry } from './types';

/**
 * Compaction (LM-21). When the conversation outgrows the window, only raw
 * tool output and old turns are compressed — and they are replaced by a
 * handoff summary, never silently dropped. The ledger snapshot is never an
 * input to compression: it passes through untouched, so after any number of
 * turns it still contains every ledger fact.
 */

export interface CompactConversationInput {
    /** The case-facts snapshot. Returned verbatim, never compressed. */
    snapshot: string;
    turns: ReadonlyArray<ContextTurn>;
    toolResults: ReadonlyArray<ToolResultEntry>;
    /** Recent turns to keep verbatim; defaults to the central config limit. */
    keepRecentTurns?: number;
}

export interface CompactConversationResult {
    /** Identical to the input snapshot. */
    snapshot: string;
    recentTurns: ReadonlyArray<ContextTurn>;
    /** Null when nothing was compacted. */
    handoffSummary: string | null;
    compactedTurnCount: number;
    droppedToolResultNames: ReadonlyArray<string>;
}

const QUOTED_TURN_MAX_CHARS = 500;
const DROPPED_TOOL_EXCERPT_MAX_CHARS = 240;

function quotedTurnExcerpt(turn: ContextTurn): string {
    const text = turn.content.length > QUOTED_TURN_MAX_CHARS ? `${turn.content.slice(0, QUOTED_TURN_MAX_CHARS)}…` : turn.content;
    return `${turn.role}: "${text}"`;
}

/**
 * Builds the handoff summary for compacted turns and dropped tool results:
 * how many turns were compacted, the earliest and most recent user turns
 * quoted verbatim, and each dropped tool result by name with a short
 * excerpt of its output. The summary itself is capped by central config.
 */
export function buildHandoffSummary(
    compactedTurns: ReadonlyArray<ContextTurn>,
    droppedToolResults: ReadonlyArray<ToolResultEntry>,
): string {
    const lines: string[] = [`HANDOFF SUMMARY (${compactedTurns.length} earlier turns compacted):`];
    const userTurns = compactedTurns.filter((turn) => turn.role === 'user');
    if (userTurns.length > 0) {
        lines.push(`First user turn: ${quotedTurnExcerpt(userTurns[0])}`);
        if (userTurns.length > 1) {
            lines.push(`Most recent compacted user turn: ${quotedTurnExcerpt(userTurns[userTurns.length - 1])}`);
        }
    }
    for (const result of droppedToolResults) {
        const excerpt =
            result.output.length > DROPPED_TOOL_EXCERPT_MAX_CHARS
                ? `${result.output.slice(0, DROPPED_TOOL_EXCERPT_MAX_CHARS)}…`
                : result.output;
        lines.push(`Dropped tool result ${result.name}: ${excerpt}`);
    }
    const summary = lines.join('\n');
    const cap = SHARED_CONFIG.CONTEXT.HANDOFF_SUMMARY_MAX_CHARS;
    return summary.length > cap ? `${summary.slice(0, cap)}…` : summary;
}

/**
 * Compacts a conversation. Old turns beyond the recent window and all
 * passed-in raw tool output are replaced by a handoff summary; the recent
 * turns stay verbatim and the snapshot is returned exactly as given.
 */
export function compactConversation(input: CompactConversationInput): CompactConversationResult {
    const keepRecentTurns = input.keepRecentTurns ?? SHARED_CONFIG.CONTEXT.RECENT_TURN_LIMIT;
    if (!Number.isInteger(keepRecentTurns) || keepRecentTurns < 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'keepRecentTurns must be a non-negative integer');
    }
    const compactedTurns =
        input.turns.length > keepRecentTurns ? input.turns.slice(0, input.turns.length - keepRecentTurns) : [];
    const recentTurns =
        input.turns.length > keepRecentTurns ? input.turns.slice(input.turns.length - keepRecentTurns) : input.turns;
    if (compactedTurns.length === 0 && input.toolResults.length === 0) {
        return {
            snapshot: input.snapshot,
            recentTurns,
            handoffSummary: null,
            compactedTurnCount: 0,
            droppedToolResultNames: [],
        };
    }
    return {
        snapshot: input.snapshot,
        recentTurns,
        handoffSummary: buildHandoffSummary(compactedTurns, input.toolResults),
        compactedTurnCount: compactedTurns.length,
        droppedToolResultNames: input.toolResults.map((result) => result.name),
    };
}
