// Ask-vs-proceed policy (LM-29): a question to the tech is a test with
// a cost, not free conversation. The talker asks this gate before it
// speaks a question; the gate answers allow or deny, with the reason.
//
// Only four kinds of ask are ever allowed: physical evidence (what the
// tech can see, hear, or measure), a safety confirmation (LM-20: the
// tech's spoken confirmation before a hazardous step), a goal amendment
// (the goal itself needs to change, LM-25), or a repeated blocker (the
// same blocker as the run before, LM-28). Anything else — a guess, a
// diagnosis, a hunch phrased as a question — is denied, and the loop
// proceeds with the next-best test instead. The gate is pure: the caller
// hands it the declared category and the facts that would justify it,
// and the gate checks them. The model never justifies its own ask.
import { z } from 'zod';

/** The only reasons a question to the tech may be asked. */
export const AskCategorySchema = z.enum([
    'physical-evidence',
    'safety-confirmation',
    'goal-amendment',
    'repeated-blocker',
]);
export type AskCategory = z.infer<typeof AskCategorySchema>;

/** A blocker counts as repeated once it has blocked two runs in a row: the third repeat is the LM-28 handoff, so the ask happens on the second. */
export const REPEATED_BLOCKER_MIN_COUNT = 2;

/** One proposed question, with the evidence that would justify it. */
export interface AskRequest {
    /** The declared category. Any other string is denied, not mapped. */
    category: string;
    /** The question itself, as it would be spoken. */
    question: string;
    /** For a safety-confirmation ask: the pending safety blocker it confirms. */
    safetyBlocker?: string;
    /** For a goal-amendment ask: what would change about the goal. */
    amendment?: string;
    /** For a repeated-blocker ask: the blocker key it is about. */
    blockerKey?: string;
}

/** What the gate needs to judge the ask: the ask budget, the pending safety confirmations, and the blocker streak. */
export interface AskPolicyContext {
    techAsksUsed: number;
    maxTechAsks: number;
    /** Safety blockers still awaiting the tech's confirmation. */
    pendingSafetyBlockers: ReadonlyArray<string>;
    /** How many runs in a row the current blocker has blocked. */
    sameBlockerCount: number;
    /** The blocker key of the current streak, if any. */
    lastBlocker?: string;
}

export type AskDecision = { allowed: true; category: AskCategory } | { allowed: false; reason: string };

const ALLOWED_CATEGORIES = 'physical evidence, safety confirmations, goal amendments, or a repeated blocker';

/** Decides whether a question to the tech may be asked. */
export function decideAsk(request: AskRequest, context: AskPolicyContext): AskDecision {
    if (request.question.trim().length === 0) {
        return { allowed: false, reason: 'A question to the tech must name what is being asked.' };
    }
    if (context.techAsksUsed >= context.maxTechAsks) {
        return {
            allowed: false,
            reason: `Tech-ask budget spent: ${context.techAsksUsed} of ${context.maxTechAsks} asks used.`,
        };
    }
    const category = AskCategorySchema.safeParse(request.category);
    if (!category.success) {
        return {
            allowed: false,
            reason: `Asks are allowed only for ${ALLOWED_CATEGORIES}; '${request.category}' is not one of them.`,
        };
    }
    switch (category.data) {
        case 'physical-evidence':
            return { allowed: true, category: category.data };
        case 'safety-confirmation':
            if (
                request.safetyBlocker !== undefined &&
                context.pendingSafetyBlockers.includes(request.safetyBlocker)
            ) {
                return { allowed: true, category: category.data };
            }
            return {
                allowed: false,
                reason: 'A safety-confirmation ask must name a safety blocker still awaiting confirmation.',
            };
        case 'goal-amendment':
            if (request.amendment !== undefined && request.amendment.trim().length > 0) {
                return { allowed: true, category: category.data };
            }
            return {
                allowed: false,
                reason: 'A goal-amendment ask must name what would change about the goal.',
            };
        case 'repeated-blocker':
            if (context.sameBlockerCount < REPEATED_BLOCKER_MIN_COUNT) {
                return {
                    allowed: false,
                    reason: 'A repeated-blocker ask needs a blocker that has blocked at least two runs in a row.',
                };
            }
            if (request.blockerKey !== undefined && request.blockerKey === context.lastBlocker) {
                return { allowed: true, category: category.data };
            }
            return {
                allowed: false,
                reason: 'A repeated-blocker ask must name the blocker that keeps repeating.',
            };
    }
}
