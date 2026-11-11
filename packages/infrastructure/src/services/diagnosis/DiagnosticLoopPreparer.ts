// Diagnostic loop preparer (LM-04): builds the loop's input from the
// case facts — priors from the fix-count store, tests from the seed
// library — so the machine's workup starts with data, never with a
// guess.
//
// TSB boost comes from provenance: a hypothesis whose prior carries
// nhtsa-tsb observations gets boosted. Safety-critical causes are the
// ones a test with a safety-critical hazard speaks to (brakes,
// airbags, high voltage); steering and hydraulics have no hazard type
// of their own, so a caller adds those ids explicitly. Any failure —
// no vehicle key, no priors, no store, no library — returns null and
// the workup skips: a missing prior must never fail a diagnosis.
import type {
    DiagnosticLoopInput,
    IFixCountStore,
    ILogger,
    TestLibrary,
    PrepareLoopInput,
    PriorHypothesis,
} from '@lemonade/core';
import { normalizeCaseFacts } from '@lemonade/core';
import { defaultTestLibraryDir, loadTestLibraryFromDirectory } from './testLibraryLoader';

/** Hazard types that mark a cause safety-critical (LM-04 stop rule). */
const SAFETY_CRITICAL_HAZARDS = new Set(['BRAKE_FAILURE', 'AIRBAG_DEPLOYMENT', 'HIGH_VOLTAGE']);

export interface DiagnosticLoopPreparerDeps {
    fixCountStore?: IFixCountStore;
    testLibrary?: TestLibrary;
    /** Injected for tests so the loader never touches disk. */
    testLibraryDir?: string;
}

export class DiagnosticLoopPreparer {
    private libraryCache: TestLibrary | null | undefined;

    constructor(
        private readonly deps: DiagnosticLoopPreparerDeps,
        private readonly logger: ILogger,
    ) {}

    private testLibrary(): TestLibrary | null {
        if (this.libraryCache !== undefined) {
            return this.libraryCache;
        }
        if (this.deps.testLibrary) {
            this.libraryCache = this.deps.testLibrary;
            return this.libraryCache;
        }
        try {
            this.libraryCache = loadTestLibraryFromDirectory(this.deps.testLibraryDir ?? defaultTestLibraryDir());
        } catch (error) {
            this.logger.warn('[DiagnosticLoopPreparer] Test library could not be loaded; workup will skip', { error });
            this.libraryCache = null;
        }
        return this.libraryCache;
    }

    async prepare(input: PrepareLoopInput): Promise<DiagnosticLoopInput | null> {
        const library = this.testLibrary();
        if (!library || !this.deps.fixCountStore) {
            return null;
        }
        const year = Number(input.vehicleContext.year ?? 0);
        const make = String(input.vehicleContext.make ?? '');
        const model = String(input.vehicleContext.model ?? '');
        if (!year || !make || !model || input.dtcCodes.length === 0) {
            this.logger.debug('[DiagnosticLoopPreparer] No vehicle key or DTCs; workup will skip', {
                sessionId: input.sessionId,
            });
            return null;
        }
        let priors: PriorHypothesis[];
        try {
            const facts = normalizeCaseFacts({
                vehicle: {
                    make,
                    model,
                    yearFrom: year,
                    yearTo: year,
                    ...(input.vehicleContext.engine ? { engine: String(input.vehicleContext.engine) } : {}),
                },
                dtcs: input.dtcCodes.map((code) => code.code),
            });
            priors = (await this.deps.fixCountStore.prior(facts)).hypotheses;
        } catch (error) {
            this.logger.warn('[DiagnosticLoopPreparer] Prior lookup failed; workup will skip', {
                error,
                sessionId: input.sessionId,
            });
            return null;
        }
        if (priors.length === 0) {
            return null;
        }
        const tsbBoosted = priors
            .filter((prior) => prior.sources.some((source) => source.source === 'nhtsa-tsb'))
            .map((prior) => prior.hypothesis);
        const safetyCritical = new Set<string>();
        for (const test of library.all()) {
            if (test.hazards.some((hazard) => SAFETY_CRITICAL_HAZARDS.has(hazard))) {
                for (const target of test.targets) {
                    safetyCritical.add(target.hypothesisId);
                }
            }
        }
        return {
            priorHypotheses: priors.map((prior) => ({
                hypothesis: prior.hypothesis,
                n: prior.n,
                pi: prior.pi,
                sources: prior.sources.map((source) => ({
                    source: source.source,
                    observationCount: source.observationCount,
                })),
            })),
            testDefinitions: library.all(),
            ...(tsbBoosted.length > 0 ? { tsbBoostedHypothesisIds: tsbBoosted } : {}),
            ...(safetyCritical.size > 0 ? { safetyCriticalHypothesisIds: [...safetyCritical].sort() } : {}),
        };
    }
}
