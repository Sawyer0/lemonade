import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import type { LedgerEventReference, TechProfile, VehicleRecord } from '../../types/memory';
import {
    VOICE_CONFIRMATION_PREFIX,
    applyCaseCloseUpdates,
    confirmationObservationText,
    forgetTechFact,
    recordVoiceConfirmation,
} from '../techProfilePolicy';

const SHOP = 'shop-1';
const VIN = '19XFB2F59FE000000';
const NOW = '2026-11-11T10:00:00.000Z';

function event(
    eventId: string,
    type: LedgerEventReference['type'],
    source: LedgerEventReference['source'],
    text?: string,
): LedgerEventReference {
    return { eventId, caseId: 'case-1', type, source, createdAt: NOW, text };
}

function emptyRecord(): VehicleRecord {
    return { shopId: SHOP, vin: VIN, summary: '', claims: [], updatedAt: NOW };
}

function emptyProfile(): TechProfile {
    return {
        techId: 'tech-1',
        shopId: SHOP,
        skillLevel: 'journeyman',
        units: 'metric',
        toolsOnHand: ['smoke machine'],
        detailPreference: 'standard',
        facts: [],
        changeLog: [],
        updatedAt: NOW,
    };
}

describe('voice confirm and forget (replay fixture)', () => {
    /** Replay: confirm by voice -> case close -> fact persists -> "forget that" -> fact gone. */
    it('persists a tech fact only after voice confirmation, and forgets it on request', () => {
        const confirmation = recordVoiceConfirmation({
            caseId: 'case-1',
            techId: 'tech-1',
            factText: 'has a smoke machine',
            at: NOW,
        });
        const observation = event('e-voice-1', 'observation', 'tech', confirmationObservationText(confirmation));
        expect(observation.text).toBe(`${VOICE_CONFIRMATION_PREFIX}has a smoke machine`);

        const closed = applyCaseCloseUpdates(emptyProfile(), emptyRecord(), [observation], [], NOW);
        expect(closed.confirmedFacts).toHaveLength(1);
        expect(closed.profile.facts[0].text).toBe('has a smoke machine');
        expect(closed.profile.facts[0].source).toBe('voice_confirmation');

        const forgotten = forgetTechFact(closed.profile, closed.profile.facts[0].factId, {
            action: 'forgotten',
            reason: 'Tech said "forget that".',
            at: NOW,
        });
        expect(forgotten.profile.facts).toHaveLength(0);
        expect(forgotten.change).toEqual(
            expect.objectContaining({ action: 'forgotten', reason: 'Tech said "forget that".' }),
        );
        expect(forgotten.profile.changeLog).toHaveLength(2);
    });

    it('corrects a fact instead of deleting it when the tech says "that is wrong"', () => {
        const closed = applyCaseCloseUpdates(
            emptyProfile(),
            emptyRecord(),
            [event('e-voice-1', 'observation', 'tech', `${VOICE_CONFIRMATION_PREFIX}uses imperial units`)],
            [],
            NOW,
        );
        const factId = closed.profile.facts[0].factId;
        const corrected = forgetTechFact(closed.profile, factId, {
            action: 'corrected',
            replacementText: 'uses metric units',
            reason: 'Tech said "that is wrong".',
            at: NOW,
        });
        expect(corrected.profile.facts[0].text).toBe('uses metric units');
        expect(corrected.change.action).toBe('corrected');
        expect(corrected.change.previousText).toBe('uses imperial units');
        expect(corrected.profile.facts[0].confirmedAt).toBe(NOW);
    });

    it('throws when forgetting a fact that does not exist', () => {
        expect(() =>
            forgetTechFact(emptyProfile(), 'fact-missing', {
                action: 'forgotten',
                reason: 'Forget that.',
                at: NOW,
            }),
        ).toThrowError(AppError);
    });

    it('throws when the forget reason is empty', () => {
        const closed = applyCaseCloseUpdates(
            emptyProfile(),
            emptyRecord(),
            [event('e-voice-1', 'observation', 'tech', `${VOICE_CONFIRMATION_PREFIX}has a smoke machine`)],
            [],
            NOW,
        );
        expect(() =>
            forgetTechFact(closed.profile, closed.profile.facts[0].factId, {
                action: 'forgotten',
                reason: '   ',
                at: NOW,
            }),
        ).toThrowError(AppError);
    });

    it('applies a model-cited claim candidate as rejected at case close', () => {
        const events = [event('e-1', 'hypothesis', 'model', 'Worn pads.')];
        const closed = applyCaseCloseUpdates(
            emptyProfile(),
            emptyRecord(),
            events,
            [{ text: 'Worn pads.', sourceEventIds: ['e-1'] }],
            NOW,
        );
        expect(closed.appliedClaims).toHaveLength(0);
        expect(closed.rejectedClaims).toEqual([{ text: 'Worn pads.', reason: 'model-sourced-event:e-1' }]);
    });

    it('supersedes a replaced fact at case close instead of leaving it standing', () => {
        const firstClose = applyCaseCloseUpdates(
            emptyProfile(),
            emptyRecord(),
            [event('e-1', 'observation', 'tech', 'Left front pad 3mm.')],
            [{ text: 'Left front pad 3mm.', sourceEventIds: ['e-1'] }],
            NOW,
        );
        expect(firstClose.record.claims).toHaveLength(1);
        const oldClaimId = firstClose.record.claims[0].claimId;

        const secondClose = applyCaseCloseUpdates(
            firstClose.profile,
            firstClose.record,
            [event('e-2', 'observation', 'tech', 'Left front pad 5mm after new pads.')],
            [
                {
                    text: 'Left front pad 5mm after new pads.',
                    sourceEventIds: ['e-2'],
                    supersedesClaimId: oldClaimId,
                },
            ],
            NOW,
        );
        expect(secondClose.rejectedClaims).toEqual([]);
        expect(secondClose.record.claims).toHaveLength(2);
        expect(secondClose.record.claims.find((claim) => claim.claimId === oldClaimId)?.status).toBe('superseded');
        const active = secondClose.record.claims.filter((claim) => claim.status === 'active');
        expect(active).toHaveLength(1);
        expect(active[0].text).toBe('Left front pad 5mm after new pads.');
        expect(active[0].supersedesClaimId).toBe(oldClaimId);
    });

    it('rejects a supersede that names a claim that is not active', () => {
        const closed = applyCaseCloseUpdates(
            emptyProfile(),
            emptyRecord(),
            [event('e-2', 'observation', 'tech', 'Left front pad 5mm after new pads.')],
            [
                {
                    text: 'Left front pad 5mm after new pads.',
                    sourceEventIds: ['e-2'],
                    supersedesClaimId: 'claim-missing',
                },
            ],
            NOW,
        );
        expect(closed.appliedClaims).toHaveLength(0);
        expect(closed.rejectedClaims).toEqual([
            { text: 'Left front pad 5mm after new pads.', reason: 'unknown-active-claim:claim-missing' },
        ]);
    });
});
