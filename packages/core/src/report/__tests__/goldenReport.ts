import {
    buildGoldenCase,
    appendGoldenLedgerEntry,
    type GoldenCaseOptions,
} from '../../goal/__tests__/fixtures/goldenCase';
import { buildCaseReport } from '../buildReport';
import type { CaseReport } from '../types';

const GENERATED_AT = new Date('2026-11-11T12:00:00.000Z');

/**
 * The closed golden case: the LM-25 misfire case, closed, with one captured
 * frame added so the report's evidence section has a frame to show. Shared
 * by the report builder tests and the report view tests so both prove the
 * same closed case renders.
 */
export function buildClosedGoldenReport(options: GoldenCaseOptions = {}): {
    report: CaseReport;
    entryIds: Set<string>;
    entryIdBySequence: Map<number, string>;
} {
    const { caseRecord, entries } = buildGoldenCase(options);
    entries.push(
        appendGoldenLedgerEntry(entries, 'frame_captured', {
            media: {
                storageUri: 'gs://lemonade-demo/frames/frame-001.jpg',
                sha256: 'a'.repeat(64),
            },
            resolution: 'high',
        }),
    );
    const report = buildCaseReport({
        caseRecord: { ...caseRecord, status: 'closed' },
        entries,
        generatedAt: GENERATED_AT,
    });
    return {
        report,
        entryIds: new Set(entries.map((entry) => entry.id)),
        entryIdBySequence: new Map(entries.map((entry) => [entry.sequence, entry.id])),
    };
}
