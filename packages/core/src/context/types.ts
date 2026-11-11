// Case-shaped context (LM-21). Every model call is built from the same three
// parts: a fixed system prompt (cacheable), one case-facts snapshot rendered
// from the ledger, and the recent turns. Repair and test procedures live as
// skills: only a short catalog (name + description) rides in the prompt, and
// the full procedure body loads on demand, only when its test is chosen.
// Tool results are capped at a share of the context window. The ledger
// snapshot is never compressed: only raw tool output and old turns are, with
// a handoff summary, and the snapshot is re-injected into the talker after
// each milestone because its sliding window drops old turns.

export type ContextRole = 'system' | 'user' | 'assistant' | 'tool';

export type ContextTurnKind = 'case-snapshot' | 'handoff-summary' | 'conversation' | 'tool-result';

/**
 * One turn in a model call. `kind` marks what the turn carries so the
 * talker can find and refresh the case snapshot instead of letting its
 * sliding window drop it.
 */
export interface ContextTurn {
    role: ContextRole;
    kind: ContextTurnKind;
    content: string;
}

/** Raw output of one tool call, kept separate from turns so it can be capped. */
export interface ToolResultEntry {
    name: string;
    output: string;
}

/** A procedure skill whose full body was loaded because its test was chosen. */
export interface LoadedProcedureSkill {
    name: string;
    body: string;
}
