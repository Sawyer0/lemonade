// Challenger unit tests (LM-19): fake Vertex models, real ledger entries.
// The challenger only reads id/type/source/payload, so the entries are
// plain literals — no hash chain is needed to test the debate role.
import { describe, expect, it, vi } from 'vitest';
import type { GenerativeModel } from '@google-cloud/vertexai';
import type { ILogger, LedgerEntry } from '@lemonade/core';
import { Challenger } from '../Challenger';

const CASE_ID = '11111111-1111-4111-8111-111111111111';

function baseEntry(id: string, source: LedgerEntry['source']): Omit<LedgerEntry, 'type' | 'payload'> {
    return {
        id,
        caseId: CASE_ID,
        sequence: 1,
        actor: { kind: 'user', id: 'tech-1' },
        source,
        occurredAt: new Date('2026-11-11T10:00:00.000Z'),
        previousHash: '0'.repeat(64),
        entryHash: 'a'.repeat(64),
        createdAt: new Date('2026-11-11T10:00:00.000Z'),
    };
}

function dtcEntry(id: string, codes: string[]): LedgerEntry {
    return { ...baseEntry(id, 'tech'), type: 'dtc_read', payload: { codes } } as LedgerEntry;
}

function testResultEntry(id: string, testName: string, result: 'pass' | 'fail' | 'inconclusive'): LedgerEntry {
    return { ...baseEntry(id, 'tech'), type: 'test_result', payload: { testName, result } } as LedgerEntry;
}

function modelEntry(id: string): LedgerEntry {
    return {
        ...baseEntry(id, 'model'),
        type: 'test_result',
        payload: { testName: 'reasoner_sandbox_computation', result: 'pass', notes: 'the model thinks it is the coil' },
    } as LedgerEntry;
}

function fakeModel(text: string | null, error?: Error): { model: GenerativeModel; generateContent: ReturnType<typeof vi.fn> } {
    const generateContent = vi.fn();
    if (error) {
        generateContent.mockRejectedValue(error);
    } else {
        generateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text }] } }] },
        });
    }
    return { model: { generateContent } as unknown as GenerativeModel, generateContent };
}

const logger: ILogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** Golden case: P0300 read, fuel pressure held, spark weak — the lead is the coil, not the pump. */
function goldenLedger(): LedgerEntry[] {
    return [
        dtcEntry('entry-dtc', ['P0300']),
        testResultEntry('entry-fuel', 'measure-fuel-pressure', 'pass'),
        testResultEntry('entry-spark', 'measure-spark-strength', 'fail'),
    ];
}

describe('Challenger', () => {
    it('returns the model objections with their ledger citations', async () => {
        const { model } = fakeModel(
            JSON.stringify({
                objections: [
                    {
                        text: 'Fuel pressure held at 55 psi, so a fuel pump failure does not explain the misfire',
                        ledgerEntryIds: ['entry-fuel'],
                        decisive: true,
                    },
                ],
            }),
        );
        const challenger = new Challenger(model, logger);
        const objections = await challenger.challenge('Fuel pump failure', goldenLedger());
        expect(objections).toEqual([
            {
                text: 'Fuel pressure held at 55 psi, so a fuel pump failure does not explain the misfire',
                ledgerEntryIds: ['entry-fuel'],
                decisive: true,
            },
        ]);
    });

    it('returns no objections when the model finds nothing against the hypothesis', async () => {
        const { model } = fakeModel(JSON.stringify({ objections: [] }));
        const challenger = new Challenger(model, logger);
        expect(await challenger.challenge('Ignition coil failure', goldenLedger())).toEqual([]);
    });

    it('shows the model only citable entries, never the reasoner claims', async () => {
        const { model, generateContent } = fakeModel(JSON.stringify({ objections: [] }));
        const challenger = new Challenger(model, logger);
        await challenger.challenge('Ignition coil failure', [...goldenLedger(), modelEntry('entry-model')]);
        const prompt = generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
        expect(prompt).toContain('entry-dtc');
        expect(prompt).toContain('entry-fuel');
        expect(prompt).not.toContain('entry-model');
        expect(prompt).not.toContain('the model thinks it is the coil');
    });

    it('throws on an empty model response instead of reporting no objections', async () => {
        const { model } = fakeModel(null);
        const challenger = new Challenger(model, logger);
        await expect(challenger.challenge('Ignition coil failure', goldenLedger())).rejects.toThrow('Empty challenger response');
    });

    it('throws when the reply has no usable objections list', async () => {
        const { model } = fakeModel(JSON.stringify({ objections: [{ text: 'no decisive flag' }] }));
        const challenger = new Challenger(model, logger);
        await expect(challenger.challenge('Ignition coil failure', goldenLedger())).rejects.toThrow(
            'did not contain a usable objections list',
        );
    });

    it('throws when the model call itself fails', async () => {
        const { model } = fakeModel(null, new Error('model unavailable'));
        const challenger = new Challenger(model, logger);
        await expect(challenger.challenge('Ignition coil failure', goldenLedger())).rejects.toThrow('model unavailable');
    });
});
