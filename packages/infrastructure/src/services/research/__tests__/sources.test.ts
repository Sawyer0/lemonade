import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type {
    EvidenceChildRequest,
    ICaseRepository,
    IGoogleSearchService,
    INHTSAService,
    LedgerEntry,
    SafetyRecall,
    SearchResponse,
} from '@lemonade/core';
import { NhtsaRecallSource } from '../sources/NhtsaRecallSource';
import { TsbSource } from '../sources/TsbSource';
import { KnownFailureSource } from '../sources/KnownFailureSource';
import { SimilarCaseSource } from '../sources/SimilarCaseSource';

const caseId = uuidv4();

function request(overrides: Partial<EvidenceChildRequest> = {}): EvidenceChildRequest {
    return {
        caseId,
        vehicleId: uuidv4(),
        vin: '1HGCM82633A004352',
        year: 2020,
        make: 'Honda',
        model: 'Civic',
        startedFrom: 'vin_decoded',
        ...overrides,
    };
}

function recall(component: string, summary: string): SafetyRecall {
    return {
        ReportReceivedDate: '2020-01-01',
        Component: component,
        Summary: summary,
        Consequence: '',
        Remedy: '',
        Notes: '',
        NHTSACampaignNumber: '20V123',
        Manufacturer: 'Honda',
        ModelYear: '2020',
        Make: 'Honda',
        Model: 'Civic',
    };
}

function searchResponse(titles: string[]): SearchResponse {
    return {
        results: titles.map((title, index) => ({
            title,
            link: `https://example.com/${index}`,
            snippet: `snippet ${index}`,
        })),
        queryUsed: 'query',
        totalFound: titles.length,
    };
}

describe('NhtsaRecallSource', () => {
    it('reports recalls for the vehicle, capped at five items', async () => {
        const nhtsa = {
            checkRecallsStrict: async () => [
                recall('ENGINE AND ENGINE COOLING', 'stall'),
                recall('SERVICE BRAKES, HYDRAULIC', 'pedal'),
            ],
            checkRecalls: async () => [],
            validateVin: async () => true,
        } as unknown as INHTSAService;
        const summary = await new NhtsaRecallSource(nhtsa).lookup(request());
        expect(summary.status).toBe('found');
        expect(summary.summary).toContain('2 recalls');
        expect(summary.items).toHaveLength(2);
        expect(summary.source).toBe('NHTSA');
    });

    it('reports none when the strict lookup answers with no recalls', async () => {
        const nhtsa = {
            checkRecallsStrict: async () => [],
            checkRecalls: async () => [],
            validateVin: async () => true,
        } as unknown as INHTSAService;
        const summary = await new NhtsaRecallSource(nhtsa).lookup(request());
        expect(summary.status).toBe('none');
        expect(summary.summary).toContain('No recalls found');
    });

    it('filters recalls by component, segment-wise', async () => {
        const nhtsa = {
            checkRecallsStrict: async () => [
                recall('ENGINE AND ENGINE COOLING:EXHAUST SYSTEM', 'catalyst'),
                recall('SERVICE BRAKES, HYDRAULIC', 'pedal'),
            ],
            checkRecalls: async () => [],
            validateVin: async () => true,
        } as unknown as INHTSAService;
        const summary = await new NhtsaRecallSource(nhtsa).lookup(request({ component: 'ENGINE AND ENGINE COOLING' }));
        expect(summary.status).toBe('found');
        expect(summary.items).toHaveLength(1);
        expect(summary.items[0].title).toContain('ENGINE AND ENGINE COOLING');
    });

    it('throws when the strict lookup fails, so the runner records unknown', async () => {
        const nhtsa = {
            checkRecallsStrict: async () => {
                throw new Error('NHTSA down');
            },
            checkRecalls: async () => [],
            validateVin: async () => true,
        } as unknown as INHTSAService;
        await expect(new NhtsaRecallSource(nhtsa).lookup(request())).rejects.toThrow('NHTSA down');
    });

    it('falls back to the forgiving lookup when strict is absent', async () => {
        const nhtsa = {
            checkRecalls: async () => [recall('ENGINE AND ENGINE COOLING', 'stall')],
            validateVin: async () => true,
        } as unknown as INHTSAService;
        const summary = await new NhtsaRecallSource(nhtsa).lookup(request());
        expect(summary.status).toBe('found');
    });

    it('does not run without year, make, and model', () => {
        const nhtsa = {} as INHTSAService;
        expect(new NhtsaRecallSource(nhtsa).canRun(request({ year: undefined }))).toBe(false);
    });
});

describe('TsbSource', () => {
    it('reports TSBs from the search results', async () => {
        const search = {
            search: async () => searchResponse(['TSB 20-001: rough idle', 'TSB 20-002: shift flare']),
        } as unknown as IGoogleSearchService;
        const summary = await new TsbSource(search).lookup(request());
        expect(summary.status).toBe('found');
        expect(summary.summary).toContain('2 technical service bulletins');
        expect(summary.summary).toContain('manufacturer guidance, not confirmed fixes');
        expect(summary.items).toHaveLength(2);
    });

    it('reports none when the search answers with nothing', async () => {
        const search = { search: async () => searchResponse([]) } as unknown as IGoogleSearchService;
        const summary = await new TsbSource(search).lookup(request());
        expect(summary.status).toBe('none');
        expect(summary.summary).toContain('No technical service bulletins found');
    });

    it('throws when the search fails, so the runner records unknown', async () => {
        const search = {
            search: async () => {
                throw new Error('search down');
            },
        } as unknown as IGoogleSearchService;
        await expect(new TsbSource(search).lookup(request())).rejects.toThrow('search down');
    });
});

describe('KnownFailureSource', () => {
    it('runs from a symptom alone, before the VIN is decoded', async () => {
        const search = {
            search: async () => searchResponse(['Civic rough idle: common causes']),
        } as unknown as IGoogleSearchService;
        const source = new KnownFailureSource(search);
        expect(
            source.canRun(request({ year: undefined, make: undefined, model: undefined, symptom: 'rough idle' })),
        ).toBe(true);
        const summary = await source.lookup(
            request({ year: undefined, make: undefined, model: undefined, symptom: 'rough idle' }),
        );
        expect(summary.status).toBe('found');
    });

    it('reports none when the search answers with nothing', async () => {
        const search = { search: async () => searchResponse([]) } as unknown as IGoogleSearchService;
        const summary = await new KnownFailureSource(search).lookup(request({ symptom: 'rough idle' }));
        expect(summary.status).toBe('none');
    });
});

describe('SimilarCaseSource', () => {
    function outcomeEntry(repair: string, sequence: number): LedgerEntry {
        return {
            id: uuidv4(),
            caseId: uuidv4(),
            sequence,
            type: 'outcome',
            actor: { kind: 'user', id: 'tech-1' },
            source: 'tech',
            occurredAt: new Date('2026-11-11T10:00:00.000Z'),
            previousHash: 'a'.repeat(64),
            entryHash: 'b'.repeat(64),
            createdAt: new Date('2026-11-11T10:00:00.000Z'),
            payload: {
                repairPerformed: repair,
                partsReplaced: [],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            },
        } as LedgerEntry;
    }

    it('reports confirmed outcomes for the vehicle', async () => {
        const caseRepo = {
            findConfirmedOutcomes: async () => [outcomeEntry('Replaced ignition coil', 3)],
        } as unknown as ICaseRepository;
        const summary = await new SimilarCaseSource(caseRepo).lookup(request());
        expect(summary.status).toBe('found');
        expect(summary.summary).toContain('1 similar closed case');
        expect(summary.items[0].title).toBe('Replaced ignition coil');
        expect(summary.source).toBe('case ledger');
    });

    it('reports none when the vehicle has no confirmed outcomes', async () => {
        const caseRepo = { findConfirmedOutcomes: async () => [] } as unknown as ICaseRepository;
        const summary = await new SimilarCaseSource(caseRepo).lookup(request());
        expect(summary.status).toBe('none');
    });

    it('does not run without a vehicle id', () => {
        const caseRepo = {} as ICaseRepository;
        expect(new SimilarCaseSource(caseRepo).canRun(request({ vehicleId: undefined }))).toBe(false);
    });

    it('throws when the ledger read fails, so the runner records unknown', async () => {
        const caseRepo = {
            findConfirmedOutcomes: async () => {
                throw new Error('ledger down');
            },
        } as unknown as ICaseRepository;
        await expect(new SimilarCaseSource(caseRepo).lookup(request())).rejects.toThrow('ledger down');
    });
});
