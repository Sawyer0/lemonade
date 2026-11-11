import type { LedgerEventReference, LedgerEventType } from '../types/memory';

/**
 * Ledger evidence rules for memory writes (LM-31). Memory writes come only
 * from ledger events, and a model-sourced claim never becomes a vehicle fact.
 * The event list mirrors the LM-01 issue; LM-01 owns the canonical schema.
 */

/** Event types that may source a vehicle fact, when they come from a non-model source. */
export const FACT_ELIGIBLE_EVENT_TYPES: ReadonlyArray<LedgerEventType> = [
    'vin_decoded',
    'dtc_read',
    'observation',
    'frame_captured',
    'test_result',
    'outcome',
    'correction',
    // LM-03: OBD readings are vehicle facts from the car itself. A fault
    // window is a raw sample dump, not a fact, so it stays out.
    'obd_scan',
    'guided_test',
    'verify_fix',
];

export function isModelSourced(event: LedgerEventReference): boolean {
    return event.source === 'model' || event.type === 'hypothesis';
}

export function isFactEligibleEvent(event: LedgerEventReference): boolean {
    if (isModelSourced(event)) return false;
    return FACT_ELIGIBLE_EVENT_TYPES.includes(event.type);
}

/** Only a confirmed outcome (a retest or a repair outcome) can confirm a playbook lesson. */
export function isConfirmedOutcomeEvent(event: LedgerEventReference): boolean {
    return event.type === 'outcome' && !isModelSourced(event);
}

export function findEventById(
    events: ReadonlyArray<LedgerEventReference>,
    eventId: string,
): LedgerEventReference | null {
    return events.find((event) => event.eventId === eventId) ?? null;
}
