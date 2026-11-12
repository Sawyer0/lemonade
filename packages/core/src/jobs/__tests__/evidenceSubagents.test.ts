import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
    EVIDENCE_MAX_CONCURRENT,
    EvidenceChildSummarySchema,
    evidenceReportLine,
    runEvidenceChildren,
    unknownChildSummary,
    type EvidenceChildRequest,
    type EvidenceChildSource,
    type EvidenceChildSummary,
} from '../evidenceSubagents';

const caseId = uuidv4();

function request(overrides: Partial<EvidenceChildRequest> = {}): EvidenceChildRequest {
    return {
        caseId,
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        vehicleId: uuidv4(),
        startedFrom: 'vin_decoded',
        ...overrides,
    };
}

function foundSummary(kind: EvidenceChildSummary['kind']): EvidenceChildSummary {
    return { kind, status: 'found', summary: `${kind} found`, items: [{ title: 'item' }], source: 'fake' };
}

function source(
    kind: EvidenceChildSummary['kind'],
    run: (request: EvidenceChildRequest) => Promise<EvidenceChildSummary>,
    canRun = true,
): EvidenceChildSource {
    return { kind, canRun: () => canRun, lookup: run };
}

describe('runEvidenceChildren', () => {
    it('returns one summary per runnable child in canonical kind order', async () => {
        const summaries = await runEvidenceChildren(
            [
                source('similar_case', async () => foundSummary('similar_case')),
                source('recall', async () => foundSummary('recall')),
                source('tsb', async () => foundSummary('tsb')),
            ],
            request(),
        );
        expect(summaries.map((summary) => summary.kind)).toEqual(['recall', 'tsb', 'similar_case']);
    });

    it('runs a duplicated kind only once', async () => {
        let runs = 0;
        const summaries = await runEvidenceChildren(
            [
                source('recall', async () => {
                    runs += 1;
                    return foundSummary('recall');
                }),
                source('recall', async () => {
                    runs += 1;
                    return foundSummary('recall');
                }),
            ],
            request(),
        );
        expect(runs).toBe(1);
        expect(summaries).toHaveLength(1);
    });

    it('never runs more than the concurrent cap at once', async () => {
        let running = 0;
        let peak = 0;
        const slow = (kind: EvidenceChildSummary['kind']): EvidenceChildSource =>
            source(kind, async () => {
                running += 1;
                peak = Math.max(peak, running);
                await new Promise((resolve) => setTimeout(resolve, 5));
                running -= 1;
                return foundSummary(kind);
            });
        await runEvidenceChildren(
            [slow('recall'), slow('tsb'), slow('known_failure'), slow('similar_case')],
            request(),
        );
        expect(peak).toBeLessThanOrEqual(EVIDENCE_MAX_CONCURRENT);
        expect(peak).toBeGreaterThan(1);
    });

    it('records a throwing child as unknown, never as none', async () => {
        const summaries = await runEvidenceChildren(
            [
                source('recall', async () => {
                    throw new Error('NHTSA down');
                }),
                source('tsb', async () => foundSummary('tsb')),
            ],
            request(),
        );
        const recall = summaries.find((summary) => summary.kind === 'recall')!;
        expect(recall.status).toBe('unknown');
        expect(recall.summary).toContain('Recall status unknown');
        expect(summaries.find((summary) => summary.kind === 'tsb')!.status).toBe('found');
    });

    it('records a child that returns an invalid summary as unknown', async () => {
        const summaries = await runEvidenceChildren(
            [
                source(
                    'recall',
                    async () =>
                        ({
                            kind: 'recall',
                            status: 'found',
                            summary: '',
                            items: [],
                            source: 'fake',
                        }) as unknown as EvidenceChildSummary,
                ),
            ],
            request(),
        );
        expect(summaries).toHaveLength(1);
        expect(summaries[0].status).toBe('unknown');
        expect(summaries[0].summary).toContain('invalid summary');
    });

    it('records a child that returns another kind as unknown', async () => {
        const summaries = await runEvidenceChildren([source('recall', async () => foundSummary('tsb'))], request());
        expect(summaries).toHaveLength(1);
        expect(summaries[0].status).toBe('unknown');
    });

    it('skips a child whose inputs are missing instead of recording unknown', async () => {
        const summaries = await runEvidenceChildren(
            [
                source('recall', async () => foundSummary('recall'), false),
                source('tsb', async () => foundSummary('tsb')),
            ],
            request({ startedFrom: 'partial_speech' }),
        );
        expect(summaries.map((summary) => summary.kind)).toEqual(['tsb']);
    });

    it('rejects a request without a case id', async () => {
        await expect(
            runEvidenceChildren([source('recall', async () => foundSummary('recall'))], {
                caseId: 'not-a-uuid',
                startedFrom: 'vin_decoded',
            }),
        ).rejects.toThrow();
    });
});

describe('unknownChildSummary', () => {
    it('says recall status unknown for a failed recall lookup', () => {
        const summary = unknownChildSummary('recall', 'lookup failed');
        expect(summary.status).toBe('unknown');
        expect(summary.summary).toBe('Recall status unknown: lookup failed');
        expect(summary.items).toEqual([]);
    });

    it('says TSB status unknown for a failed TSB lookup', () => {
        expect(unknownChildSummary('tsb', 'lookup failed').summary).toBe('TSB status unknown: lookup failed');
    });
});

describe('evidenceReportLine', () => {
    it('shows unknown in the report line for a failed lookup', () => {
        expect(evidenceReportLine(unknownChildSummary('recall', 'lookup failed'))).toBe(
            'Recalls: Recall status unknown: lookup failed',
        );
    });

    it('shows the summary for a found lookup', () => {
        expect(evidenceReportLine(foundSummary('tsb'))).toBe('TSBs: tsb found');
    });
});

describe('EvidenceChildSummarySchema', () => {
    it('rejects more than five items', () => {
        const parsed = EvidenceChildSummarySchema.safeParse({
            kind: 'recall',
            status: 'found',
            summary: 'x',
            items: Array.from({ length: 6 }, (_, index) => ({ title: `item ${index}` })),
            source: 'fake',
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects an empty summary', () => {
        const parsed = EvidenceChildSummarySchema.safeParse({
            kind: 'recall',
            status: 'found',
            summary: '',
            items: [],
            source: 'fake',
        });
        expect(parsed.success).toBe(false);
    });
});
