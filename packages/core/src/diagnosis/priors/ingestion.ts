// Ingestion (LM-33): each feed becomes FixCounts, or is skipped with a
// reason — never silently dropped, never guessed.
//
// - NHTSA flat files (complaints, recalls, TSB summaries): mapped by
//   NHTSA component through the curated map in component.ts. A record
//   whose component has no mapped cause is skipped, and because NHTSA
//   records carry no DTC, their counts are vehicle-level (empty DTC set).
// - AutoRepairBench (ECU/DTC -> repair): one record is one observation of
//   its repair measure for its bench DTC. Bench DTCs are ECU-native codes
//   (e.g. 5D0C), not SAE J2012, so they are stored as-is and match only
//   the same bench code. The dataset is research-use-only (licenses.ts):
//   eval and seed priors only.
// - Repair-order free text: extract -> normalize terms -> cluster.
// - Lemonade's own ledger: a confirmed `outcome` entry counts only with
//   an ExpertValidation attestation (LM-35). Anything else is skipped.
import { z } from 'zod';
import type { SafetyRecall } from '../../types/models';
import type { CaseFacts, ExpertValidation, FixCount, PriorSource } from './types';
import { normalizeFixCount } from './types';
import { causeForNhtsaComponent } from './component';
import { clusterRepairTerms, extractRepairTerms, normalizeRepairTerm } from './termNormalizer';
import type { LedgerEntry } from '../../types/case';
import type { IFixCountStore } from '../../ports/IFixCountStore';

export interface IngestedSkipped {
    reason: string;
}

export interface IngestionResult {
    counts: FixCount[];
    skipped: IngestedSkipped[];
}

function emptyResult(): IngestionResult {
    return { counts: [], skipped: [] };
}

function skipped(reason: string): IngestionResult {
    return { counts: [], skipped: [{ reason }] };
}

function singleCount(raw: FixCount): IngestionResult {
    return { counts: [normalizeFixCount(raw)], skipped: [] };
}

// --- NHTSA flat files ---
// One row of a complaints / recalls / TSB flat file: the vehicle, the
// NHTSA component path, and the free-text summary. Only the component is
// used for the cause — the summary is never substring-searched.
export const NhtsaFlatFileRowSchema = z.object({
    make: z.string().min(1),
    model: z.string().min(1),
    modelYear: z.coerce.number().int().min(1900).max(2100),
    component: z.string().min(1),
    summary: z.string().optional(),
});
export type NhtsaFlatFileRow = z.infer<typeof NhtsaFlatFileRowSchema>;

function nhtsaComponentCount(
    make: string,
    model: string,
    modelYear: number,
    component: string,
    source: PriorSource,
): IngestionResult {
    const cause = causeForNhtsaComponent(component);
    if (!cause) {
        return skipped(`No mapped cause for NHTSA component "${component}"`);
    }
    return singleCount({
        vehicle: { make, model, yearFrom: modelYear, yearTo: modelYear },
        dtcs: [],
        hypothesis: cause,
        observationCount: 1,
        sourceCounts: { [source]: 1 },
    });
}

/** One flat-file row (complaints or TSB summary) -> one vehicle-level count, or skipped. */
export function parseNhtsaFlatFileRow(row: unknown, source: PriorSource): IngestionResult {
    const parsed = NhtsaFlatFileRowSchema.safeParse(row);
    if (!parsed.success) {
        return skipped(`Invalid NHTSA flat-file row: ${parsed.error.message}`);
    }
    const entry = parsed.data;
    return nhtsaComponentCount(entry.make, entry.model, entry.modelYear, entry.component, source);
}

/** One NHTSA recall (api.nhtsa.gov shape) -> one vehicle-level count, or skipped. */
export function parseNhtsaRecall(recall: SafetyRecall): IngestionResult {
    const year = recall.ModelYear ? Number(recall.ModelYear) : Number.NaN;
    if (!recall.Make || !recall.Model || !Number.isInteger(year)) {
        return skipped('Recall is missing make, model, or a numeric model year');
    }
    return nhtsaComponentCount(recall.Make, recall.Model, year, recall.Component, 'nhtsa-recalls');
}

// --- AutoRepairBench ---
// One record of Integrated_Data.json: an ECU/DTC input string and a
// structured repair answer. The DTC is pulled out of the input string;
// the repair measure is extracted through the term tables, so a measure
// with no recognized repair term is skipped rather than stored verbatim.
export const AutoRepairBenchRecordSchema = z.object({
    input: z.string().min(1),
    output: z.object({
        FaultDescription: z.string().min(1),
        RepairMeasures: z.string().min(1),
    }),
});
export type AutoRepairBenchRecord = z.infer<typeof AutoRepairBenchRecordSchema>;

const BENCH_INPUT_DTC_PATTERN = /DTC:\s*([0-9A-Za-z]+)/;

export function parseAutoRepairBenchRecord(record: unknown): IngestionResult {
    const parsed = AutoRepairBenchRecordSchema.safeParse(record);
    if (!parsed.success) {
        return skipped(`Invalid AutoRepairBench record: ${parsed.error.message}`);
    }
    const dtcMatch = BENCH_INPUT_DTC_PATTERN.exec(parsed.data.input);
    if (!dtcMatch?.[1]) {
        return skipped('AutoRepairBench input names no DTC');
    }
    const terms = extractRepairTerms(parsed.data.output.RepairMeasures);
    if (terms.length === 0) {
        return skipped(`No recognized repair term in "${parsed.data.output.RepairMeasures}"`);
    }
    // The benchmark is BMW-centered with no per-record model, so its counts
    // are keyed make BMW, model '*' (any model), all years.
    return singleCount({
        vehicle: { make: 'BMW', model: '*', yearFrom: 1900, yearTo: 2100 },
        dtcs: [dtcMatch[1].toUpperCase()],
        hypothesis: terms[0] as string,
        observationCount: 1,
        sourceCounts: { autorepairbench: 1 },
    });
}

// --- Repair-order free text ---
/** One repair order's free text -> clustered counts for the case's facts, or skipped when nothing is recognized. */
export function parseRepairOrderText(text: string, facts: CaseFacts): IngestionResult {
    const result = emptyResult();
    const clusters = clusterRepairTerms(extractRepairTerms(text));
    if (clusters.length === 0) {
        return skipped('No recognized repair term in repair-order text');
    }
    for (const cluster of clusters) {
        result.counts.push(
            normalizeFixCount({
                vehicle: facts.vehicle,
                dtcs: facts.dtcs,
                ...(facts.mileageBand ? { mileageBand: facts.mileageBand } : {}),
                hypothesis: cluster.hypothesis,
                observationCount: cluster.observationCount,
                sourceCounts: { 'repair-order': cluster.observationCount },
            }),
        );
    }
    return result;
}

// --- Lemonade's own ledger ---
export type LedgerOutcomeIngestion = { ok: true; count: FixCount } | { ok: false; reason: string };

/**
 * A ledger `outcome` entry becomes one ledger observation — only when the
 * outcome is confirmed AND an expert validation attests it (LM-35). An
 * unconfirmed outcome, an unvalidated one, or a non-outcome entry is
 * skipped with the reason, never counted.
 */
export function ledgerOutcomeToFixCount(
    entry: LedgerEntry,
    facts: CaseFacts,
    validation: ExpertValidation | null,
): LedgerOutcomeIngestion {
    if (entry.type !== 'outcome') {
        return { ok: false, reason: `Ledger entry ${entry.id} is a ${entry.type} entry, not an outcome` };
    }
    if (!entry.payload.confirmed) {
        return { ok: false, reason: `Outcome ${entry.id} is not confirmed` };
    }
    if (!validation) {
        return { ok: false, reason: `Outcome ${entry.id} has no expert validation (LM-35)` };
    }
    const terms = extractRepairTerms(entry.payload.repairPerformed);
    const hypothesis = terms[0] ?? normalizeRepairTerm(entry.payload.repairPerformed);
    return {
        ok: true,
        count: normalizeFixCount({
            vehicle: facts.vehicle,
            dtcs: facts.dtcs,
            ...(facts.mileageBand ? { mileageBand: facts.mileageBand } : {}),
            hypothesis,
            observationCount: 1,
            sourceCounts: { 'lemonade-ledger': 1 },
        }),
    };
}

/**
 * The one-call path for the done-when "new expert-validated outcomes
 * update counts": converts a ledger outcome with its expert validation
 * and records it into the store. An unconfirmed, unvalidated, or
 * non-outcome entry records nothing and returns the skip reason, so a
 * caller never has to remember the convert-then-record two-step — or
 * forget the record half of it.
 */
export async function recordValidatedLedgerOutcome(
    store: IFixCountStore,
    entry: LedgerEntry,
    facts: CaseFacts,
    validation: ExpertValidation | null,
): Promise<LedgerOutcomeIngestion> {
    const ingested = ledgerOutcomeToFixCount(entry, facts, validation);
    if (ingested.ok) {
        await store.recordFix(ingested.count);
    }
    return ingested;
}
