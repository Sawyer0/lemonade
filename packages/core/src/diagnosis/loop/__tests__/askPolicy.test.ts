// Ask-vs-proceed policy tests (LM-29): a question to the tech is allowed
// only for physical evidence, safety confirmations, goal amendments, or a
// repeated blocker — and only while the tech-ask budget has asks left.
import { describe, it, expect } from 'vitest';
import { decideAsk, REPEATED_BLOCKER_MIN_COUNT, type AskPolicyContext } from '../askPolicy';

function policyContext(overrides: Partial<AskPolicyContext> = {}): AskPolicyContext {
    return {
        techAsksUsed: 0,
        maxTechAsks: 6,
        pendingSafetyBlockers: [],
        sameBlockerCount: 0,
        ...overrides,
    };
}

describe('decideAsk', () => {
    it('allows a physical-evidence ask within budget', () => {
        const decision = decideAsk(
            { category: 'physical-evidence', question: 'Does the shake happen cold or only under load?' },
            policyContext(),
        );
        expect(decision).toEqual({ allowed: true, category: 'physical-evidence' });
    });

    it('denies any ask once the tech-ask budget is spent', () => {
        const decision = decideAsk(
            { category: 'physical-evidence', question: 'Does the shake happen cold or only under load?' },
            policyContext({ techAsksUsed: 6, maxTechAsks: 6 }),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: 'Tech-ask budget spent: 6 of 6 asks used.',
        });
    });

    it('denies an ask whose category is not one of the four allowed', () => {
        const decision = decideAsk(
            { category: 'diagnosis', question: 'What do you think is wrong with it?' },
            policyContext(),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: "Asks are allowed only for physical evidence, safety confirmations, goal amendments, or a repeated blocker; 'diagnosis' is not one of them.",
        });
    });

    it('denies an empty question even in an allowed category', () => {
        const decision = decideAsk({ category: 'physical-evidence', question: '   ' }, policyContext());
        expect(decision).toEqual({
            allowed: false,
            reason: 'A question to the tech must name what is being asked.',
        });
    });

    it('allows a safety-confirmation ask naming a pending blocker', () => {
        const decision = decideAsk(
            {
                category: 'safety-confirmation',
                question: 'Confirm the engine is off and the key is out before the cover comes off.',
                safetyBlocker: 'Engine off and key out before any cover comes off.',
            },
            policyContext({
                pendingSafetyBlockers: ['Engine off and key out before any cover comes off.'],
            }),
        );
        expect(decision).toEqual({ allowed: true, category: 'safety-confirmation' });
    });

    it('denies a safety-confirmation ask naming a blocker that is not pending', () => {
        const decision = decideAsk(
            {
                category: 'safety-confirmation',
                question: 'Confirm the engine is cool before reaching near the exhaust.',
                safetyBlocker: 'Engine cool to the touch before reaching near the exhaust side.',
            },
            policyContext({ pendingSafetyBlockers: ['Engine off and key out before any cover comes off.'] }),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: 'A safety-confirmation ask must name a safety blocker still awaiting confirmation.',
        });
    });

    it('denies a safety-confirmation ask naming no blocker', () => {
        const decision = decideAsk(
            { category: 'safety-confirmation', question: 'Is it safe to go ahead?' },
            policyContext({ pendingSafetyBlockers: ['Engine off and key out before any cover comes off.'] }),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: 'A safety-confirmation ask must name a safety blocker still awaiting confirmation.',
        });
    });

    it('allows a goal-amendment ask naming what would change', () => {
        const decision = decideAsk(
            {
                category: 'goal-amendment',
                question: 'The complaint changed: should the goal cover the stall at idle too?',
                amendment: 'Add the stall at idle to the complaint symptoms.',
            },
            policyContext(),
        );
        expect(decision).toEqual({ allowed: true, category: 'goal-amendment' });
    });

    it('denies a goal-amendment ask naming no change', () => {
        const decision = decideAsk(
            { category: 'goal-amendment', question: 'Should we change the goal?' },
            policyContext(),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: 'A goal-amendment ask must name what would change about the goal.',
        });
    });

    it('allows a repeated-blocker ask naming the repeating blocker', () => {
        const decision = decideAsk(
            {
                category: 'repeated-blocker',
                question: 'The scan tool still will not connect — is the port itself damaged?',
                blockerKey: 'no_progress',
            },
            policyContext({ sameBlockerCount: REPEATED_BLOCKER_MIN_COUNT, lastBlocker: 'no_progress' }),
        );
        expect(decision).toEqual({ allowed: true, category: 'repeated-blocker' });
    });

    it('denies a repeated-blocker ask on the first occurrence', () => {
        const decision = decideAsk(
            {
                category: 'repeated-blocker',
                question: 'The scan tool will not connect — is the port damaged?',
                blockerKey: 'no_progress',
            },
            policyContext({ sameBlockerCount: 1, lastBlocker: 'no_progress' }),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: 'A repeated-blocker ask needs a blocker that has blocked at least two runs in a row.',
        });
    });

    it('denies a repeated-blocker ask naming a different blocker', () => {
        const decision = decideAsk(
            {
                category: 'repeated-blocker',
                question: 'The scope still shows no signal — is the probe seated?',
                blockerKey: 'drift:missing-spark-trace',
            },
            policyContext({ sameBlockerCount: 2, lastBlocker: 'no_progress' }),
        );
        expect(decision).toEqual({
            allowed: false,
            reason: 'A repeated-blocker ask must name the blocker that keeps repeating.',
        });
    });
});
