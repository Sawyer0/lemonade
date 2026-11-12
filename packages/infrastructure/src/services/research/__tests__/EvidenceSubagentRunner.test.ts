import { describe, expect, it, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type {
    AppendLedgerEntryInput,
    EvidenceChildRequest,
    EvidenceChildSource,
    EvidenceChildSummary,
    ICaseRepository,
    ILogger,
    LedgerEntry,
} from '@lemonade/core';
import { EvidenceSubagentRunner } from '../EvidenceSubagentRunner';

const caseId = uuidv4();

const silentLogger: ILogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
};

function foundSummary(kind: EvidenceChildSummary['kind']): EvidenceChildSummary {
    return { kind, status: 'found', summary: `${kind} found`, items: [{ title: 'item' }], source: 'fake' };
}

function source(
    kind: EvidenceChildSummary['kind'],
    run?: () => Promise<EvidenceChildSummary>,
    canRun: boolean | ((request: EvidenceChildRequest) => boolean) = true,
): EvidenceChildSource {
    return {
        kind,
        canRun: typeof canRun === 'function' ? canRun : () => canRun,
        lookup: run ?? (async () => foundSummary(kind)),
    };
}

interface FiledEntry {
    caseId: string;
    input: AppendLedgerEntryInput;
}

function fakeCaseRepo(): { repo: ICaseRepository; filed: FiledEntry[] } {
    const filed: FiledEntry[] = [];
    const repo = {
        appendEntry: vi.fn(async (filedCaseId: string, input: AppendLedgerEntryInput) => {
            filed.push({ caseId: filedCaseId, input });
            return { id: uuidv4(), caseId: filedCaseId, sequence: filed.length } as LedgerEntry;
        }),
    } as unknown as ICaseRepository;
    return { repo, filed };
}

function runner(sources: EvidenceChildSource[]): { runner: EvidenceSubagentRunner; filed: FiledEntry[] } {
    const { repo, filed } = fakeCaseRepo();
    return { runner: new EvidenceSubagentRunner(repo, sources, silentLogger), filed };
}

describe('EvidenceSubagentRunner', () => {
    it('files one advisory entry per child on VIN decode', async () => {
        const { runner: evidence, filed } = runner([
            source('recall'),
            source('tsb'),
            source('known_failure'),
            source('similar_case'),
        ]);
        const summaries = await evidence.launchOnVinDecoded({
            caseId,
            vehicleId: uuidv4(),
            vin: '1HGCM82633A004352',
            year: 2020,
            make: 'Honda',
            model: 'Civic',
        });
        expect(summaries).toHaveLength(4);
        expect(filed).toHaveLength(4);
        for (const entry of filed) {
            expect(entry.caseId).toBe(caseId);
            expect(entry.input.type).toBe('advisory');
            expect(entry.input.source).toBe('research');
            expect(entry.input.actor).toEqual({ kind: 'agent', id: 'evidence-subagents' });
        }
        expect(filed.map((entry) => (entry.input.payload as EvidenceChildSummary).kind)).toEqual([
            'recall',
            'tsb',
            'known_failure',
            'similar_case',
        ]);
    });

    it('files unknown, never none, when a lookup fails', async () => {
        const { runner: evidence, filed } = runner([
            source('recall', async () => {
                throw new Error('NHTSA down');
            }),
            source('tsb'),
        ]);
        const summaries = await evidence.launchOnVinDecoded({
            caseId,
            year: 2020,
            make: 'Honda',
            model: 'Civic',
        });
        const recall = summaries.find((summary) => summary.kind === 'recall')!;
        expect(recall.status).toBe('unknown');
        expect(recall.summary).toContain('Recall status unknown');
        const filedRecall = filed.find(
            (entry) => (entry.input.payload as EvidenceChildSummary).kind === 'recall',
        )!;
        expect((filedRecall.input.payload as EvidenceChildSummary).status).toBe('unknown');
    });

    it('files nothing twice for the same case', async () => {
        const { runner: evidence, filed } = runner([source('recall'), source('tsb')]);
        const first = await evidence.launchOnVinDecoded({
            caseId,
            year: 2020,
            make: 'Honda',
            model: 'Civic',
        });
        const second = await evidence.launchOnVinDecoded({
            caseId,
            year: 2020,
            make: 'Honda',
            model: 'Civic',
        });
        expect(first).toHaveLength(2);
        expect(second).toEqual([]);
        expect(filed).toHaveLength(2);
    });

    it('still runs later when an early launch could run nothing', async () => {
        const { runner: evidence, filed } = runner([
            source('recall', undefined, (request) => request.year !== undefined),
        ]);
        const early = await evidence.launchEarlyFromPartialSpeech({ caseId });
        expect(early).toEqual([]);
        expect(filed).toHaveLength(0);
        // The empty early launch does not count as launched: the VIN decode
        // launch for the same case still runs and files.
        const summaries = await evidence.launchOnVinDecoded({
            caseId,
            year: 2020,
            make: 'Honda',
            model: 'Civic',
        });
        expect(summaries).toHaveLength(1);
        expect(filed).toHaveLength(1);
    });

    it('launches only runnable children from partial speech', async () => {
        const { runner: evidence, filed } = runner([
            source('recall', undefined, false),
            source('known_failure'),
        ]);
        const summaries = await evidence.launchEarlyFromPartialSpeech({
            caseId,
            symptom: 'rough idle',
        });
        expect(summaries.map((summary) => summary.kind)).toEqual(['known_failure']);
        expect(filed).toHaveLength(1);
    });

    it('still files the other children when one ledger append fails', async () => {
        const filed: FiledEntry[] = [];
        let appends = 0;
        const repo = {
            appendEntry: async (filedCaseId: string, input: AppendLedgerEntryInput) => {
                appends += 1;
                if (appends === 1) {
                    throw new Error('ledger down');
                }
                filed.push({ caseId: filedCaseId, input });
                return { id: uuidv4(), caseId: filedCaseId, sequence: filed.length } as LedgerEntry;
            },
        } as unknown as ICaseRepository;
        const evidence = new EvidenceSubagentRunner(repo, [source('recall'), source('tsb')], silentLogger);
        const summaries = await evidence.launchOnVinDecoded({
            caseId,
            year: 2020,
            make: 'Honda',
            model: 'Civic',
        });
        expect(summaries).toHaveLength(2);
        expect(appends).toBe(2);
        expect(filed).toHaveLength(1);
    });
});
