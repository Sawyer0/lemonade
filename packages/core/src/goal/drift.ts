import { extractRepairTerms } from '../diagnosis/priors/termNormalizer';
import { retractedEntryIds, type LedgerEntry } from '../types/case';
import type { CaseGoal } from './goalSchema';

// --- Goal drift detection (LM-28) ---
// Pure and deterministic, like the LM-25 evaluator: same goal + same ledger
// + same run outcome always returns the same flags. It reads only what it is
// given, never the network, the clock, or a model.
//
// Drift is flagged in exactly three cases:
// - the leading hypothesis explains none of the complaint's symptoms;
// - the proposed repair doesn't match the committed cause;
// - the reasoner targets a fault code unrelated to the complaint.
//
// What the detector can and cannot know:
// - Symptom coverage comes from the hypothesis itself: the reasoner declares
//   which complaint symptoms its hypothesis explains (the optional
//   `explainsSymptoms` on a hypothesis ledger entry). A hypothesis that never
//   declares coverage is unknown, not drift: the detector never flags on
//   missing data, only on a declared claim that covers nothing.
// - Cause/repair matching is vocabulary-bound: both sides are reduced to the
//   canonical repair terms the priors module recognizes (LM-33). When either
//   side names no known term, the match is unknown and no flag is raised.
//   The detector never invents a term, and it never asks a model.
// - Fault codes come from the ledger (`dtc_read`, `obd_scan`) for the
//   complaint and from the run for what the reasoner targeted. A complaint
//   with no recorded codes cannot make a code unrelated, so no flag is raised.

/** The three drift cases. */
export const DRIFT_KINDS = [
    'hypothesis_explains_no_symptoms',
    'repair_mismatches_committed_cause',
    'fault_code_unrelated_to_complaint',
] as const;
export type DriftKind = (typeof DRIFT_KINDS)[number];

/** One drift finding: what drifted, and what evidence would unblock it. */
export interface DriftFlag {
    kind: DriftKind;
    detail: string;
    /** The evidence the tech must supply, named concretely. */
    missingEvidence: string[];
}

/** The run's leading hypothesis and the symptoms it claims to explain. */
export interface LeadingHypothesis {
    text: string;
    confidence: number;
    explainsSymptoms?: string[];
}

/**
 * What one reasoner run declares about itself, plus the ledger entries it
 * appended. The detector reads the run's own claims (hypothesis, cause,
 * repair, targeted codes) and checks them against the goal and the ledger;
 * it never re-interprets free text beyond the canonical-term extraction
 * for the repair check. `ledger` in the assessor is the full ledger
 * including these appended entries.
 */
export interface ReasonerRunOutcome {
    runId: string;
    leadingHypothesis?: LeadingHypothesis;
    committedCause?: string;
    proposedRepair?: string;
    targetedFaultCodes?: string[];
    appendedEntries: LedgerEntry[];
}

/** Lowercases, strips punctuation, collapses whitespace: symptom comparison. */
function normalizeSymptom(symptom: string): string {
    return symptom
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Fault codes compare case-insensitively, ignoring whitespace. */
function normalizeFaultCode(code: string): string {
    return code.toUpperCase().replace(/\s+/g, '');
}

/** Every fault code recorded for the complaint, from `dtc_read` and `obd_scan` entries. */
function complaintFaultCodes(ledger: ReadonlyArray<LedgerEntry>): ReadonlySet<string> {
    const codes = new Set<string>();
    for (const entry of ledger) {
        if (entry.type === 'dtc_read') {
            for (const code of entry.payload.codes) {
                codes.add(normalizeFaultCode(code));
            }
        } else if (entry.type === 'obd_scan') {
            for (const code of [
                ...entry.payload.storedCodes,
                ...entry.payload.pendingCodes,
                ...entry.payload.permanentCodes,
            ]) {
                codes.add(normalizeFaultCode(code));
            }
        }
    }
    return codes;
}

/**
 * The ledger's leading hypothesis: the highest-confidence uncorrected
 * hypothesis entry, latest sequence breaking ties. The run's own declared
 * hypothesis wins when present; this is the fallback for replay from the
 * ledger alone.
 */
function leadingLedgerHypothesis(ledger: ReadonlyArray<LedgerEntry>): LeadingHypothesis | undefined {
    const retracted = retractedEntryIds(ledger);
    let leading: LeadingHypothesis | undefined;
    for (const entry of [...ledger].sort((a, b) => a.sequence - b.sequence)) {
        if (entry.type !== 'hypothesis' || retracted.has(entry.id)) {
            continue;
        }
        if (leading === undefined || entry.payload.confidence >= leading.confidence) {
            leading = {
                text: entry.payload.text,
                confidence: entry.payload.confidence,
                ...(entry.payload.explainsSymptoms !== undefined
                    ? { explainsSymptoms: entry.payload.explainsSymptoms }
                    : {}),
            };
        }
    }
    return leading;
}

/**
 * Flags the three drift cases for one run. Each check only fires on a
 * declared claim it can verify; unknown coverage, unknown vocabulary, and a
 * complaint with no codes are all silent, never flagged.
 */
export function detectDrift(
    goal: CaseGoal,
    ledger: ReadonlyArray<LedgerEntry>,
    run: ReasonerRunOutcome,
): DriftFlag[] {
    const flags: DriftFlag[] = [];
    const hypothesis = run.leadingHypothesis ?? leadingLedgerHypothesis(ledger);
    if (hypothesis?.explainsSymptoms !== undefined) {
        const explained = new Set(
            hypothesis.explainsSymptoms.map(normalizeSymptom).filter((symptom) => symptom.length > 0),
        );
        const complaintSymptoms = goal.complaint.symptoms.map(normalizeSymptom);
        const coversAny = complaintSymptoms.some((symptom) => explained.has(symptom));
        if (!coversAny) {
            flags.push({
                kind: 'hypothesis_explains_no_symptoms',
                detail: `Leading hypothesis "${hypothesis.text}" explains none of the complaint's symptoms`,
                missingEvidence: [...goal.complaint.symptoms],
            });
        }
    }
    const committedCause = run.committedCause?.trim();
    const proposedRepair = run.proposedRepair?.trim();
    if (
        committedCause !== undefined &&
        committedCause.length > 0 &&
        proposedRepair !== undefined &&
        proposedRepair.length > 0
    ) {
        const causeTerms = extractRepairTerms(committedCause);
        const repairTerms = extractRepairTerms(proposedRepair);
        const repairAddressesCause = causeTerms.some((term) => repairTerms.includes(term));
        if (causeTerms.length > 0 && repairTerms.length > 0 && !repairAddressesCause) {
            flags.push({
                kind: 'repair_mismatches_committed_cause',
                detail: `Proposed repair "${proposedRepair}" addresses none of the committed cause's terms (${causeTerms.join(', ')}); repair terms: ${repairTerms.join(', ')}`,
                missingEvidence: [...causeTerms],
            });
        }
    }
    const targeted = (run.targetedFaultCodes ?? []).map(normalizeFaultCode).filter((code) => code.length > 0);
    const complaintCodes = complaintFaultCodes(ledger);
    if (targeted.length > 0 && complaintCodes.size > 0) {
        const targetsComplaintCode = targeted.some((code) => complaintCodes.has(code));
        if (!targetsComplaintCode) {
            flags.push({
                kind: 'fault_code_unrelated_to_complaint',
                detail: `Reasoner targets fault code${targeted.length === 1 ? '' : 's'} ${targeted.join(', ')}, unrelated to the complaint's ${[...complaintCodes].join(', ')}`,
                missingEvidence: [...complaintCodes],
            });
        }
    }
    return flags;
}
