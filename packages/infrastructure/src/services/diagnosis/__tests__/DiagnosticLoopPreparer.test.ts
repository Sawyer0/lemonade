import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { InMemoryFixCountStore } from '@lemonade/core';
import type { ILogger } from '@lemonade/core';
import { DiagnosticLoopPreparer } from '../DiagnosticLoopPreparer';
import { loadTestLibraryFromDirectory } from '../testLibraryLoader';

// The seed files are the library's source of truth: the preparer hands
// the loop the real definitions, not a fixture copy.
const seedDir = fileURLToPath(new URL('../../../../../../data/tests', import.meta.url));

function seedLibrary() {
    return loadTestLibraryFromDirectory(seedDir);
}

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;

const P0300 = {
    code: 'P0300',
    system: 'P' as const,
    systemName: 'Powertrain',
    generic: true,
    subsystemDigit: '3',
    subsystem: 'Ignition system or misfire',
    description: 'Random/multiple cylinder misfire detected',
};

async function seededStore() {
    const store = new InMemoryFixCountStore();
    await store.recordFixes([
        {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
            dtcs: ['P0300'],
            hypothesis: 'ignition-coil-failure',
            observationCount: 7,
            sourceCounts: { autorepairbench: 5, 'nhtsa-tsb': 2 },
        },
        {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
            dtcs: ['P0300'],
            hypothesis: 'spark-plug-fouled',
            observationCount: 5,
            sourceCounts: { autorepairbench: 5 },
        },
    ]);
    return store;
}

describe('DiagnosticLoopPreparer', () => {
    it('builds loop input from priors and the library, boosting TSB-backed causes', async () => {
        const preparer = new DiagnosticLoopPreparer(
            { fixCountStore: await seededStore(), testLibrary: seedLibrary() },
            logger,
        );
        const input = await preparer.prepare({
            vehicleContext: { year: 2015, make: 'Honda', model: 'Civic', engine: '1.8L' },
            dtcCodes: [P0300],
            userId: 'u1',
            sessionId: 's1',
        });
        expect(input?.priorHypotheses[0]?.hypothesis).toBe('ignition-coil-failure');
        expect(input?.priorHypotheses).toHaveLength(2);
        expect(input?.tsbBoostedHypothesisIds).toEqual(['ignition-coil-failure']);
        expect(input?.testDefinitions).toHaveLength(12);
    });

    it('returns null when the vehicle has no priors', async () => {
        const preparer = new DiagnosticLoopPreparer(
            { fixCountStore: await seededStore(), testLibrary: seedLibrary() },
            logger,
        );
        const input = await preparer.prepare({
            vehicleContext: { year: 2020, make: 'Toyota', model: 'Camry' },
            dtcCodes: [P0300],
            userId: 'u1',
            sessionId: 's1',
        });
        expect(input).toBeNull();
    });

    it('returns null without a vehicle key, DTCs, store, or library', async () => {
        const preparer = new DiagnosticLoopPreparer(
            { fixCountStore: await seededStore(), testLibrary: seedLibrary() },
            logger,
        );
        expect(
            await preparer.prepare({ vehicleContext: {}, dtcCodes: [P0300], userId: 'u1', sessionId: 's1' }),
        ).toBeNull();
        expect(
            await preparer.prepare({
                vehicleContext: { year: 2015, make: 'Honda', model: 'Civic' },
                dtcCodes: [],
                userId: 'u1',
                sessionId: 's1',
            }),
        ).toBeNull();
        const noStore = new DiagnosticLoopPreparer(
            { testLibrary: seedLibrary() },
            logger,
        );
        expect(
            await noStore.prepare({
                vehicleContext: { year: 2015, make: 'Honda', model: 'Civic' },
                dtcCodes: [P0300],
                userId: 'u1',
                sessionId: 's1',
            }),
        ).toBeNull();
    });

    it('returns null instead of failing when the store throws', async () => {
        const failingStore = {
            prior: async () => {
                throw new Error('database down');
            },
        } as unknown as import('@lemonade/core').IFixCountStore;
        const preparer = new DiagnosticLoopPreparer(
            { fixCountStore: failingStore, testLibrary: seedLibrary() },
            logger,
        );
        const input = await preparer.prepare({
            vehicleContext: { year: 2015, make: 'Honda', model: 'Civic' },
            dtcCodes: [P0300],
            userId: 'u1',
            sessionId: 's1',
        });
        expect(input).toBeNull();
    });
});
