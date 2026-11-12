import { describe, it, expect } from 'vitest';
import {
    appendGoldenLedgerEntry,
    buildGoldenCase,
} from '../../goal/__tests__/fixtures/goldenCase';
import { buildCaseReport } from '../buildReport';
import { CaseReportSchema, type CaseReport } from '../types';

const GENERATED_AT = new Date('2026-11-11T12:00:00.000Z');

/**
 * The closed golden case: the LM-25 misfire case, closed, with one captured
 * frame added so the report's evidence section has a frame to show.
 */
function buildClosedGoldenReport(): { report: CaseReport; entryIds: Set<string> } {
    const { caseRecord, entries } = buildGoldenCase();
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
    return { report, entryIds: new Set(entries.map((entry) => entry.id)) };
}

/** Every `citation` object in the report, however deeply nested. */
function collectCitations(report: CaseReport): { entryId: string; sequence: number }[] {
    const found: { entryId: string; sequence: number }[] = [];
    const visit = (value: unknown): void => {
        if (value === null || typeof value !== 'object') {
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        const record = value as Record<string, unknown>;
        if (
            typeof record['entryId'] === 'string' &&
            typeof record['sequence'] === 'number' &&
            'occurredAt' in record
        ) {
            found.push({ entryId: record['entryId'], sequence: record['sequence'] });
            return;
        }
        Object.values(record).forEach(visit);
    };
    visit(report);
    return found;
}

describe('buildCaseReport', () => {
    it('renders the closed golden case to the exact report shape', () => {
        const { report } = buildClosedGoldenReport();
        expect(CaseReportSchema.parse(report)).toEqual(report);
        expect(report).toMatchSnapshot();
    });

    it('links every statement to a ledger entry', () => {
        const { report, entryIds } = buildClosedGoldenReport();
        const citations = collectCitations(report);
        expect(citations.length).toBeGreaterThan(0);
        for (const citation of citations) {
            expect(entryIds.has(citation.entryId)).toBe(true);
        }
    });

    it('ranks the differential by latest confidence', () => {
        const { report } = buildClosedGoldenReport();
        expect(report.differential.map((item) => item.hypothesis)).toEqual([
            'Head gasket leak',
            'Ignition coil failure',
        ]);
        expect(report.differential[0]?.confidence).toBe(0.8);
    });

    it('shows the frame in evidence with its storage reference and hash', () => {
        const { report } = buildClosedGoldenReport();
        const frames = report.evidence.filter((item) => item.kind === 'frame');
        expect(frames).toHaveLength(1);
        expect(frames[0]?.mediaUri).toBe('gs://lemonade-demo/frames/frame-001.jpg');
        expect(frames[0]?.mediaSha256).toBe('a'.repeat(64));
    });

    it('excludes a corrected re-test from the tests and lists the correction', () => {
        const { caseRecord, entries } = buildGoldenCase({ correctRetest: true });
        const retest = entries.find(
            (entry) => entry.type === 'test_result' && entry.payload.testName === 'compression-cylinder-1',
        );
        const report = buildCaseReport({
            caseRecord: { ...caseRecord, status: 'closed' },
            entries,
            generatedAt: GENERATED_AT,
        });
        expect(report.tests.map((test) => test.name)).not.toContain('compression-cylinder-1');
        expect(report.corrections).toHaveLength(1);
        expect(report.corrections[0]?.correctedEntryId).toBe(retest?.id);
    });

    it('omits repair and outcome while the case is still open', () => {
        const { caseRecord, entries } = buildGoldenCase();
        const openEntries = entries.filter((entry) => entry.type !== 'outcome');
        const report = buildCaseReport({ caseRecord, entries: openEntries, generatedAt: GENERATED_AT });
        expect(report.repair).toBeUndefined();
        expect(report.outcome).toBeUndefined();
    });

    it('omits the vehicle section when no VIN was decoded', () => {
        const { caseRecord, entries } = buildGoldenCase();
        const withoutVin = entries.filter((entry) => entry.type !== 'vin_decoded');
        const report = buildCaseReport({
            caseRecord: { ...caseRecord, status: 'closed' },
            entries: withoutVin,
            generatedAt: GENERATED_AT,
        });
        expect(report.vehicle).toBeUndefined();
        expect(report.complaint?.text).toBe('Misfire on cylinder 1 at idle');
    });
});
