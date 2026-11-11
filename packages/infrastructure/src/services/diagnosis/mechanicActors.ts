import { fromPromise } from 'xstate';
import type {
    AIAnalysis,
    GatherAllContextInput,
    IChatAssistantAI,
    IGoogleSearchService,
    ILogger,
    INHTSAService,
    IntuitionInput,
    MemoryInput,
    NhtsaInput,
    ReasoningInput,
    SafetyRecall,
    SearchInput,
    VectorInput,
    VerificationInput,
    VisionInput,
} from '@lemonade/core';
import { MemoryTags } from '@lemonade/core';
import type { IntuitionGenerator } from './IntuitionGenerator';
import type { EvidenceAnalyzer } from './EvidenceAnalyzer';

const SIMILAR_CASE_LIMIT = 3;

export interface MechanicActorDeps {
    intuition: IntuitionGenerator;
    evidence: EvidenceAnalyzer;
    nhtsaService: INHTSAService;
    searchService: IGoogleSearchService;
    chatAI: IChatAssistantAI;
    logger: ILogger;
}

/** Runs one context source and degrades to an empty result if it fails; a missing source is routine, so it logs at debug. */
async function orEmpty<T>(logger: ILogger, source: string, run: () => Promise<T[]>): Promise<T[]> {
    try {
        return await run();
    } catch (error) {
        logger.debug(`[gatherAllContext] ${source} failed`, { error });
        return [];
    }
}

/**
 * The promise actors the mechanic state machine invokes, bound to the services
 * that implement each step. Context sources fail soft so one outage never
 * blocks a diagnosis.
 */
export function createMechanicActors(deps: MechanicActorDeps) {
    const { intuition, evidence, nhtsaService, searchService, chatAI, logger } = deps;

    return {
        generateIntuition: fromPromise(async ({ input }: { input: IntuitionInput }) =>
            intuition.generate(
                input.userQuery,
                input.vehicleContext,
                input.nhtsaResults,
                input.vehicleHistory,
                input.sessionId,
                input.queuedEvidence ?? [],
            ),
        ),

        visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) => {
            const ctx = input.data;
            if (!ctx.videoUrl) return ctx.visualAnalysis as AIAnalysis;

            const reasoningInput: ReasoningInput = {
                videoUrl: ctx.videoUrl,
                vehicleContext: ctx.vehicleContext,
                sessionId: ctx.sessionId,
                userId: ctx.userId,
                userQuery: ctx.userQuery,
                localTriage: ctx.localTriage,
            };
            // LM-17 checkpoint: evidence queued since the run started reaches
            // the vision call — the last model call of the run — instead of
            // arriving after it and being read by nothing.
            return evidence.analyze(
                reasoningInput,
                ctx.searchResults,
                ctx.verificationResult,
                ctx.vehicleHistory,
                ctx.nhtsaResults as SafetyRecall[],
                ctx.queuedEvidence ?? [],
            );
        }),

        nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => {
            const { year, make, model } = input.data;
            const result = await nhtsaService.checkRecalls(year, make, model);
            logger.debug('[Actor] nhtsaCheck completed', { recalls: result.length });
            return result;
        }),

        vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
            try {
                return await input.service.search(input.data.query, SIMILAR_CASE_LIMIT, {
                    userId: input.data.userId,
                });
            } catch (e) {
                logger.warn('Vector search failed', { error: e });
                return [];
            }
        }),

        googleSearch: fromPromise(async ({ input }: { input: SearchInput }) => {
            try {
                return await searchService.search(input.data);
            } catch (e) {
                logger.warn('Google search failed', { error: e });
                return { results: [], queryUsed: input.data.query, totalFound: 0 };
            }
        }),

        webVerification: fromPromise(async ({ input }: { input: VerificationInput }) =>
            chatAI.verifyHypothesis(input.data),
        ),

        supermemorySearch: fromPromise(async ({ input }: { input: MemoryInput }) => {
            try {
                const query = `Vehicle VIN: ${input.data.vin || 'Unknown'}. Component/Issue: ${input.data.query}`;
                return await input.service.search(query, {
                    tags: [MemoryTags.vin(input.data.vin || 'unknown')],
                });
            } catch (e) {
                logger.warn('Supermemory search failed', { error: e });
                return [];
            }
        }),

        // One actor gathers all context with Promise.all; the machine's parallel
        // states did not reliably join, so the fan-out lives here instead.
        gatherAllContext: fromPromise(async ({ input }: { input: GatherAllContextInput }) => {
            const { vehicleContext, userQuery, userId, services } = input;
            const [recalls, history, vectors] = await Promise.all([
                orEmpty(logger, 'NHTSA', () =>
                    services.nhtsa.checkRecalls(
                        Number(vehicleContext.year || 0),
                        String(vehicleContext.make || ''),
                        String(vehicleContext.model || ''),
                    ),
                ),
                orEmpty(logger, 'Memory', () =>
                    services.memory.search(
                        `Vehicle VIN: ${vehicleContext.vin || 'Unknown'}. Component/Issue: ${userQuery}`,
                        { tags: MemoryTags.forVehicle(userId, String(vehicleContext.vin || 'unknown')) },
                    ),
                ),
                orEmpty(logger, 'Vector', () => services.vector.search(userQuery, SIMILAR_CASE_LIMIT, { userId })),
            ]);
            logger.debug('[Actor] gatherAllContext completed', {
                recalls: recalls.length,
                history: history.length,
                vectors: vectors.length,
            });
            return { recalls, history, vectors };
        }),
    };
}
