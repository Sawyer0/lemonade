import type { Case, LedgerEntry } from '../types/case';
import type {
    CaseReport,
    ReportCitation,
    ReportCode,
    ReportComplaint,
    ReportCorrection,
    ReportDifferentialItem,
    ReportEvidenceItem,
    ReportTestItem,
} from './types';

/** Input to the report builder: the case and its ledger, in any order. */
export interface BuildCaseReportInput {
    caseRecord: Case;
    entries: LedgerEntry[];
    /** Clock is passed in: the builder is pure and never reads the time. */
    generatedAt: Date;
}

type GoalSetEntry = Extract<LedgerEntry, { type: 'goal_set' }>;
type ObservationEntry = Extract<LedgerEntry, { type: 'observation' }>;
type VinDecodedEntry = Extract<LedgerEntry, { type: 'vin_decoded' }>;
type OutcomeEntry = Extract<LedgerEntry, { type: 'outcome' }>;

/**
 * Builds a one-page case report straight from the ledger (LM-06). Every
 * statement cites the ledger entry it came from; a section is omitted when
 * the ledger has no entry for it. An entry a `correction` retracts is
 * excluded from every section, so a retracted test can never appear as a
 * passing test — the correction itself is listed, citing its own entry.
 */
export function buildCaseReport(input: BuildCaseReportInput): CaseReport {
    const ordered = [...input.entries].sort((left, right) => left.sequence - right.sequence);
    const correctedIds = new Set(
        ordered.filter((entry) => entry.type === 'correction').map((entry) => entry.correctsEntryId),
    );
    const usable = ordered.filter((entry) => !correctedIds.has(entry.id));

    const citationOf = (entry: LedgerEntry): ReportCitation => ({
        entryId: entry.id,
        sequence: entry.sequence,
        occurredAt: entry.occurredAt.toISOString(),
    });

    const vehicleEntry = lastOf<VinDecodedEntry>(
        usable,
        (entry): entry is VinDecodedEntry => entry.type === 'vin_decoded',
    );
    const goalEntry = firstOf<GoalSetEntry>(usable, (entry): entry is GoalSetEntry => entry.type === 'goal_set');
    const complaintObservation = firstOf<ObservationEntry>(
        usable,
        (entry): entry is ObservationEntry => entry.type === 'observation',
    );
    const outcomeEntry = lastOf<OutcomeEntry>(usable, (entry): entry is OutcomeEntry => entry.type === 'outcome');
    const complaint = complaintOf(goalEntry, complaintObservation, citationOf);

    return {
        caseId: input.caseRecord.id,
        caseStatus: input.caseRecord.status,
        generatedAt: input.generatedAt.toISOString(),
        entryCount: ordered.length,
        ...(vehicleEntry === undefined
            ? {}
            : {
                  vehicle: {
                      vin: vehicleEntry.payload.vin,
                      ...(vehicleEntry.payload.year === undefined ? {} : { year: vehicleEntry.payload.year }),
                      ...(vehicleEntry.payload.make === undefined ? {} : { make: vehicleEntry.payload.make }),
                      ...(vehicleEntry.payload.model === undefined ? {} : { model: vehicleEntry.payload.model }),
                      ...(vehicleEntry.payload.trim === undefined ? {} : { trim: vehicleEntry.payload.trim }),
                      citation: citationOf(vehicleEntry),
                  },
              }),
        ...(complaint === undefined ? {} : { complaint }),
        codes: codesOf(usable, citationOf),
        evidence: evidenceOf(usable, citationOf),
        differential: differentialOf(usable, citationOf),
        tests: testsOf(usable, citationOf),
        ...(outcomeEntry === undefined
            ? {}
            : {
                  repair: {
                      repairPerformed: outcomeEntry.payload.repairPerformed,
                      partsReplaced: outcomeEntry.payload.partsReplaced,
                      citation: citationOf(outcomeEntry),
                  },
                  outcome: {
                      codesCleared: outcomeEntry.payload.codesCleared,
                      symptomGone: outcomeEntry.payload.symptomGone,
                      retestPassed: outcomeEntry.payload.retestPassed,
                      confirmed: outcomeEntry.payload.confirmed,
                      ...(outcomeEntry.payload.notes === undefined ? {} : { notes: outcomeEntry.payload.notes }),
                      citation: citationOf(outcomeEntry),
                  },
              }),
        corrections: correctionsOf(ordered, citationOf),
    };
}

/**
 * The complaint is the goal's tech-confirmed complaint when the case has a
 * goal; otherwise the earliest observation. Absent both, there is no
 * complaint section — the report never states what the ledger does not prove.
 */
function complaintOf(
    goalEntry: GoalSetEntry | undefined,
    complaintObservation: ObservationEntry | undefined,
    citationOf: (entry: LedgerEntry) => ReportCitation,
): ReportComplaint | undefined {
    if (goalEntry !== undefined) {
        return { text: goalEntry.payload.goal.complaint.text, citation: citationOf(goalEntry) };
    }
    if (complaintObservation !== undefined) {
        return { text: complaintObservation.payload.text, citation: citationOf(complaintObservation) };
    }
    return undefined;
}

function firstOf<T extends LedgerEntry>(
    entries: LedgerEntry[],
    isType: (entry: LedgerEntry) => entry is T,
): T | undefined {
    for (const entry of entries) {
        if (isType(entry)) {
            return entry;
        }
    }
    return undefined;
}

function lastOf<T extends LedgerEntry>(
    entries: LedgerEntry[],
    isType: (entry: LedgerEntry) => entry is T,
): T | undefined {
    let found: T | undefined;
    for (const entry of entries) {
        if (isType(entry)) {
            found = entry;
        }
    }
    return found;
}

function codesOf(usable: LedgerEntry[], citationOf: (entry: LedgerEntry) => ReportCitation): ReportCode[] {
    const codes: ReportCode[] = [];
    for (const entry of usable) {
        if (entry.type === 'dtc_read') {
            for (const code of entry.payload.codes) {
                codes.push({
                    code,
                    state: 'read',
                    ...(entry.payload.freezeFrame === undefined ? {} : { freezeFrame: entry.payload.freezeFrame }),
                    citation: citationOf(entry),
                });
            }
        }
        if (entry.type === 'obd_scan') {
            const states = [
                { state: 'stored' as const, found: entry.payload.storedCodes },
                { state: 'pending' as const, found: entry.payload.pendingCodes },
                { state: 'permanent' as const, found: entry.payload.permanentCodes },
            ];
            for (const { state, found } of states) {
                for (const code of found) {
                    codes.push({ code, state, citation: citationOf(entry) });
                }
            }
        }
    }
    return codes;
}

function evidenceOf(usable: LedgerEntry[], citationOf: (entry: LedgerEntry) => ReportCitation): ReportEvidenceItem[] {
    const evidence: ReportEvidenceItem[] = [];
    for (const entry of usable) {
        if (entry.type === 'observation') {
            evidence.push({
                kind: 'observation',
                text: entry.payload.text,
                occurredAt: entry.occurredAt.toISOString(),
                citation: citationOf(entry),
            });
        }
        if (entry.type === 'frame_captured') {
            evidence.push({
                kind: 'frame',
                mediaUri: entry.payload.media.storageUri,
                mediaSha256: entry.payload.media.sha256,
                occurredAt: entry.occurredAt.toISOString(),
                citation: citationOf(entry),
            });
        }
    }
    return evidence;
}

function differentialOf(
    usable: LedgerEntry[],
    citationOf: (entry: LedgerEntry) => ReportCitation,
): ReportDifferentialItem[] {
    const latestByText = new Map<string, ReportDifferentialItem>();
    for (const entry of usable) {
        if (entry.type !== 'hypothesis') {
            continue;
        }
        latestByText.set(entry.payload.text, {
            hypothesis: entry.payload.text,
            confidence: entry.payload.confidence,
            citation: citationOf(entry),
        });
    }
    return [...latestByText.values()].sort(
        (left, right) => right.confidence - left.confidence || right.citation.sequence - left.citation.sequence,
    );
}

function testsOf(usable: LedgerEntry[], citationOf: (entry: LedgerEntry) => ReportCitation): ReportTestItem[] {
    const tests: ReportTestItem[] = [];
    for (const entry of usable) {
        if (entry.type === 'test_result') {
            tests.push({
                name: entry.payload.testName,
                result: entry.payload.result,
                ...(entry.payload.measuredValue === undefined ? {} : { measuredValue: entry.payload.measuredValue }),
                ...(entry.payload.unit === undefined ? {} : { unit: entry.payload.unit }),
                citation: citationOf(entry),
            });
        }
        if (entry.type === 'guided_test') {
            tests.push({
                name: entry.payload.definitionName,
                result: entry.payload.result,
                citation: citationOf(entry),
            });
        }
        if (entry.type === 'verify_fix') {
            tests.push({
                name: 'verify-fix',
                result: entry.payload.passed ? 'pass' : 'fail',
                citation: citationOf(entry),
            });
        }
    }
    return tests;
}

function correctionsOf(ordered: LedgerEntry[], citationOf: (entry: LedgerEntry) => ReportCitation): ReportCorrection[] {
    const corrections: ReportCorrection[] = [];
    for (const entry of ordered) {
        if (entry.type === 'correction') {
            corrections.push({
                text: entry.payload.text,
                correctedEntryId: entry.correctsEntryId,
                citation: citationOf(entry),
            });
        }
    }
    return corrections;
}
