import { setup, fromPromise, assign } from 'xstate';
import { NeurosymbolicState } from '../types/neurosymbolic';
import type { IMultimodalUploadAnalyzer, IChatAssistantAI } from '../interfaces/IAIService';
import type { INHTSAService } from '../interfaces/INHTSAService';
import type { IVectorRepository } from '../interfaces/IVectorRepository';
import type { IGoogleSearchService } from '../interfaces/IGoogleSearchService';
import type { IMemoryService, MemorySearchResult } from '../interfaces/IMemoryService';
import type { AIAnalysis, SafetyRecall, VectorDocument } from '../types/models';
import type { VerificationRequest, VerificationResponse, SearchRequest, SearchResponse } from '../types/verification';
import type { LocalTriageResult } from '../types/localPerception';

export interface VisionInput {
    service: IMultimodalUploadAnalyzer;
    data: MechanicContext & {
        searchContext: SearchResponse | undefined;
        verificationContext: VerificationResponse | undefined;
    };
}
export interface NhtsaInput {
    service: INHTSAService;
    data: { year: number; make: string; model: string };
}
export interface VectorInput {
    service: IVectorRepository;
    data: { query: string; userId: string };
}
export interface SearchInput {
    service: IGoogleSearchService;
    data: SearchRequest;
}
export interface VerificationInput {
    service: IChatAssistantAI;
    data: VerificationRequest;
}
export interface MemoryInput {
    service: IMemoryService;
    data: { query: string; userId: string; vin?: string };
}
export interface GatherAllContextInput {
    services: MechanicServices;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    userId: string;
}
export interface GatherAllContextOutput {
    recalls: SafetyRecall[];
    history: MemorySearchResult[];
    vectors: VectorDocument[];
}

export interface MechanicInput {
    sessionId: string;
    userId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string;
    videoDuration?: number;
    services: MechanicServices;
    localTriage?: LocalTriageResult;
}

export interface MechanicContext extends MechanicInput {
    nhtsaResults: SafetyRecall[];
    embeddingInfo: VectorDocument[];
    vehicleHistory: MemorySearchResult[];
    visualAnalysis?: AIAnalysis;
    searchResults?: SearchResponse;
    verificationResult?: VerificationResponse;
    result?: NeurosymbolicState;
    error?: string;
    localTriage?: LocalTriageResult;
}

export interface MechanicServices {
    vision: IMultimodalUploadAnalyzer;
    nhtsa: INHTSAService;
    vector: IVectorRepository;
    chat: IChatAssistantAI;
    search: IGoogleSearchService;
    memory: IMemoryService;
}

export type MechanicEvent =
    | {
          type: 'DIAGNOSE';
          userId: string;
          sessionId: string;
          vehicleContext: Record<string, unknown>;
          userQuery: string;
          videoUrl?: string;
          videoDuration?: number;
          localTriage?: LocalTriageResult;
      }
    | { type: 'UPDATE_SERVICES'; services: MechanicServices };

export interface IntuitionInput {
    userQuery: string;
    vehicleContext: Record<string, unknown>;
    nhtsaResults: SafetyRecall[];
    vehicleHistory: MemorySearchResult[];
    videoUrl?: string;
    userId: string;
    sessionId: string;
}

export const mechanicMachine = setup({
    types: {
        context: {} as MechanicContext,
        events: {} as MechanicEvent,
        input: {} as MechanicInput,
    },
    actions: {
        loadVisionModel: () => {}, // Conceptual: Implementation provided by consumer (Server/Client)
        unloadVisionModel: () => {}, // Conceptual: Implementation provided by consumer (Server/Client)
    },
    actors: {
        generateIntuition: fromPromise<AIAnalysis, IntuitionInput>(async () => {
            throw new Error('generateIntuition implementation missing');
        }), // To be provided in service
        visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) =>
            input.service.analyzeUploadedVideo(
                input.data.videoUrl!,
                JSON.stringify(input.data.vehicleContext),
                'video/mp4',
                input.data.userId,
                input.data.sessionId,
                undefined,
                input.data.videoDuration,
            ),
        ),
        nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) =>
            input.service.checkRecalls(input.data.year, input.data.make, input.data.model),
        ),
        vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
            return input.service.search(input.data.query, 3, { userId: input.data.userId });
        }),
        googleSearch: fromPromise(async ({ input }: { input: SearchInput }) => {
            return input.service.search(input.data);
        }),
        webVerification: fromPromise(async ({ input }: { input: VerificationInput }) => {
            return input.service.verifyHypothesis(input.data);
        }),
        supermemorySearch: fromPromise(async ({ input }: { input: MemoryInput }) => {
            return input.service.search(
                `Vehicle VIN: ${input.data.vin || 'Unknown'}. Component/Issue: ${input.data.query}`,
                {
                    tags: [`user:${input.data.userId}`, `vin:${input.data.vin || 'unknown'}`],
                },
            );
        }),
        gatherAllContext: fromPromise<GatherAllContextOutput, GatherAllContextInput>(async () => {
            throw new Error('gatherAllContext implementation missing'); // To be provided in service
        }),
    },
}).createMachine({
    id: 'mechanic',
    initial: 'idle',
    context: ({ input }) => ({
        ...input,
        sessionId: input.sessionId,
        userId: input.userId,
        vehicleContext: input.vehicleContext,
        userQuery: input.userQuery,
        videoUrl: input.videoUrl,
        videoDuration: input.videoDuration,
        services: input.services,
        nhtsaResults: [],
        embeddingInfo: [],
        vehicleHistory: [],
    }),
    states: {
        idle: {
            on: {
                DIAGNOSE: {
                    target: 'gathering_context',
                    actions: assign(({ event }: { event: MechanicEvent }) => {
                        if (event.type === 'DIAGNOSE') {
                            return {
                                sessionId: event.sessionId,
                                userId: event.userId,
                                vehicleContext: event.vehicleContext,
                                userQuery: event.userQuery,
                                videoUrl: event.videoUrl,
                                videoDuration: event.videoDuration,
                                localTriage: event.localTriage,
                            };
                        }
                        return {};
                    }),
                },
                UPDATE_SERVICES: {
                    actions: assign(({ event }) => {
                        if ('services' in event) {
                            return { services: event.services };
                        }
                        return {};
                    }),
                },
            },
        },
        gathering_context: {
            description:
                'Step 1: Gather Facts (Recalls & History) BEFORE Intuition - Using Promise.all workaround for XState parallel bug',
            invoke: {
                src: 'gatherAllContext',
                input: ({ context }: { context: MechanicContext }) => ({
                    services: context.services,
                    vehicleContext: context.vehicleContext,
                    userQuery: context.userQuery,
                    userId: context.userId,
                }),
                onDone: {
                    target: 'intuition',
                    actions: [
                        () => console.log('   [XState] gathering_context.onDone -> intuition'),
                        assign({
                            nhtsaResults: ({ event }) => event.output.recalls,
                            vehicleHistory: ({ event }) => event.output.history,
                            embeddingInfo: ({ event }) => event.output.vectors,
                        }),
                    ],
                },
                onError: {
                    target: 'intuition', // Continue even on error
                    actions: [
                        () => console.log('   [XState] gathering_context.onError -> intuition'),
                        assign({ error: ({ event }) => String(event.error) }),
                    ],
                },
            },
        },
        intuition: {
            description: 'Step 2: Formulate Hypothesis (ASE Master Tech) using gathered context',
            invoke: {
                // This actor is defined in MechanicReasoningService.ts
                src: 'generateIntuition',
                input: ({ context }: { context: MechanicContext }) => ({
                    userQuery: context.userQuery,
                    vehicleContext: context.vehicleContext,
                    nhtsaResults: context.nhtsaResults,
                    vehicleHistory: context.vehicleHistory,
                    videoUrl: context.videoUrl,
                    userId: context.userId,
                    sessionId: context.sessionId,
                }),
                onDone: {
                    target: 'investigating',
                    actions: assign({
                        // We store the intuition result (AIAnalysis format) in visualAnalysis for now,
                        // or we could add a specific 'intuitionResult' to context.
                        // For minimal schema changes, reusing visualAnalysis (which holds diagnosis/confidence) acts as our 'Current Belief'.
                        visualAnalysis: ({ event }) => event.output,
                    }),
                },
                onError: {
                    target: 'synthesizing', // Fail safe
                    actions: assign({ error: ({ event }) => String(event.error) }),
                },
            },
        },
        investigating: {
            description: 'Step 3: Verify Hypothesis (Search & Web)',
            type: 'parallel',
            states: {
                search: {
                    initial: 'searching',
                    states: {
                        searching: {
                            invoke: {
                                src: 'googleSearch',
                                input: ({ context }: { context: MechanicContext }) => {
                                    // INTUITION-DRIVEN SEARCH:
                                    const intuition = context.visualAnalysis;
                                    const query =
                                        intuition?.diagnosis && intuition.diagnosis !== 'Unknown'
                                            ? `${intuition.diagnosis} ${JSON.stringify(context.vehicleContext)}`
                                            : `${context.userQuery} ${JSON.stringify(context.vehicleContext)}`;

                                    return {
                                        service: context.services.search,
                                        data: {
                                            query,
                                            limit: 3,
                                            userId: context.userId,
                                            sessionId: context.sessionId,
                                        },
                                    };
                                },
                                onDone: {
                                    target: 'completed',
                                    actions: assign({ searchResults: ({ event }) => event.output }),
                                },
                                onError: {
                                    target: 'completed',
                                    actions: assign({ error: ({ event }) => String(event.error) }),
                                },
                            },
                        },
                        completed: { type: 'final' },
                    },
                },
                verification: {
                    initial: 'verifying',
                    states: {
                        verifying: {
                            invoke: {
                                src: 'webVerification',
                                input: ({ context }: { context: MechanicContext }) => ({
                                    service: context.services.chat,
                                    data: {
                                        hypothesis: context.visualAnalysis?.diagnosis || context.userQuery,
                                        evidence: JSON.stringify({
                                            vehicle: context.vehicleContext,
                                            recalls: context.nhtsaResults,
                                            history: context.vehicleHistory,
                                        }),
                                        sessionId: context.sessionId,
                                    },
                                }),
                                onDone: {
                                    target: 'completed',
                                    actions: assign({ verificationResult: ({ event }) => event.output }),
                                },
                                onError: {
                                    target: 'completed',
                                    actions: assign({ error: ({ event }) => String(event.error) }),
                                },
                            },
                        },
                        completed: { type: 'final' },
                    },
                },
            },
            onDone: 'vision_verifying',
        },
        vision_verifying: {
            description: 'Step 4: Vision Check (if applicable) to anchor Reality',
            entry: 'loadVisionModel', // Optimized Resource Management
            exit: 'unloadVisionModel', // Release memory immediately
            invoke: {
                src: 'visionAnalysis',
                input: ({ context }: { context: MechanicContext }) => ({
                    service: context.services.vision,
                    data: {
                        ...context,
                        searchContext: context.searchResults,
                        verificationContext: context.verificationResult,
                    },
                }),
                onDone: {
                    target: 'synthesizing',
                    actions: assign(({ event, context }) => {
                        // Merge Vision result with Intuition result if vision ran
                        // If no video, we keep the Intuition result (already in visualAnalysis)
                        if (context.videoUrl) {
                            return { visualAnalysis: event.output };
                        }
                        return {};
                    }),
                },
                onError: {
                    target: 'synthesizing',
                    actions: assign({ error: ({ event }) => String(event.error) }),
                },
            },
        },
        synthesizing: {
            description: 'Step 5: Final Synthesis (Reflexion)',
            type: 'final',
        },
    },
});
