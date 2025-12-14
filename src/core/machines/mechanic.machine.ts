import { setup, fromPromise, assign } from 'xstate';
import { NeurosymbolicState, NeurosymbolicStateSchema } from '@/core/types/neurosymbolic';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import type { IMultimodalUploadAnalyzer, IChatAssistantAI } from '@/core/interfaces/IAIService';
import type { INHTSAService } from '@/core/interfaces/INHTSAService';
import type { IVectorRepository } from '@/core/interfaces/IVectorRepository';
import type { IGoogleSearchService } from '@/core/interfaces/IGoogleSearchService'; 
import type { AIAnalysis } from '@/core/types/models';
import type { VerificationRequest, VerificationResponse, SearchRequest, SearchResponse } from '@/application/dtos/verification.dto';


export interface VisionInput { service: IMultimodalUploadAnalyzer; data: MechanicContext & { searchContext: SearchResponse | undefined; verificationContext: VerificationResponse | undefined } }
export interface NhtsaInput { service: INHTSAService; data: { year: number; make: string; model: string } }
export interface VectorInput { service: IVectorRepository; data: { query: string; userId: string } }
export interface SearchInput { service: IGoogleSearchService; data: SearchRequest }
export interface VerificationInput { service: IChatAssistantAI; data: VerificationRequest }
export interface WebInput { service: IChatAssistantAI; data: VerificationRequest } 

export interface MechanicInput {
    sessionId: string;
    userId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string; 
    services: MechanicServices; 
}

export interface MechanicContext extends MechanicInput {
    nhtsaResults: unknown[];
    embeddingInfo: Record<string, unknown>[];
    visualAnalysis?: AIAnalysis;
    searchResults?: SearchResponse;
    verificationResult?: VerificationResponse;
    result?: NeurosymbolicState;
    error?: string;
}

export interface MechanicServices {
    vision: IMultimodalUploadAnalyzer;
    nhtsa: INHTSAService;
    vector: IVectorRepository;
    chat: IChatAssistantAI;
    search: IGoogleSearchService;
}

export type MechanicEvent =
    | { type: 'DIAGNOSE'; userId: string; sessionId: string; vehicleContext: Record<string, unknown>; userQuery: string; videoUrl?: string }
    | { type: 'REPORT_ERROR'; error: string }
    | { type: 'UPDATE_SERVICES'; services: MechanicServices };

export const mechanicMachine = setup({
    types: {
        context: {} as MechanicContext,
        events: {} as MechanicEvent,
        input: {} as MechanicInput, 
    },
    actions: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError: assign({ error: ({ event }: { event: any }) => event.error.message }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setResult: assign({ result: ({ event }: { event: any }) => event.output }),
    },
    actors: {
        visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) => input.service.analyzeUploadedVideo(input.data.videoUrl!, JSON.stringify(input.data.vehicleContext), 'video/mp4', input.data.userId, input.data.sessionId)),
        nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => input.service.checkRecalls(input.data.year, input.data.make, input.data.model)),
        vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
            return input.service.search(input.data.query, 3, { userId: input.data.userId });
        }),
        // Actor 4: Web Search (Google)
        googleSearch: fromPromise(async ({ input }: { input: SearchInput }) => {
            return input.service.search(input.data);
        }),
        // Actor 5: Hypothesis Verification (LLM)
        webVerification: fromPromise(async ({ input }: { input: VerificationInput }) => {
            return input.service.verifyHypothesis(input.data);
        })
    },
    guards: {
        hasVideo: ({ context }) => !!context.videoUrl,
        hasRecalls: ({ context }) => context.nhtsaResults.length > 0,
    }
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
        services: input.services,
        nhtsaResults: [],
        embeddingInfo: [],
    }),
    states: {
        idle: {
            on: {
                DIAGNOSE: {
                    target: 'analyzing',
                    actions: assign({
                        sessionId: ({ event }) => event.sessionId,
                        userId: ({ event }) => event.userId,
                        vehicleContext: ({ event }) => event.vehicleContext,
                        userQuery: ({ event }) => event.userQuery,
                        videoUrl: ({ event }) => event.videoUrl
                    })
                },
                UPDATE_SERVICES: {
                    actions: assign({
                        services: ({ event }) => event.services
                    })
                }
            }
        },
        analyzing: {
            description: "Stage 1: Nodes 2 & 3 (Memory & Search/Authority)",
            type: 'parallel',
            states: {
                authority: {
                    initial: 'checking',
                    states: {
                        checking: {
                            invoke: {
                                src: 'nhtsaCheck',
                                input: ({ context }: { context: MechanicContext }) => ({
                                    service: context.services.nhtsa,
                                    data: {
                                        year: Number((context.vehicleContext as any).year || 0),
                                        make: String((context.vehicleContext as any).make || ''),
                                        model: String((context.vehicleContext as any).model || '')
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: assign({ nhtsaResults: ({ event }) => event.output })
                                },
                                onError: { target: 'done' }
                            }
                        },
                        done: { type: 'final' }
                    }
                },
                memory: {
                    initial: 'searching',
                    states: {
                        searching: {
                            invoke: {
                                src: 'vectorSearch',
                                input: ({ context }: { context: MechanicContext }) => ({ service: context.services.vector, data: { query: context.userQuery, userId: context.userId } }),
                                onDone: {
                                    target: 'done',
                                    actions: assign({ embeddingInfo: ({ event }) => event.output })
                                },
                                onError: { target: 'done' }
                            }
                        },
                        done: { type: 'final' }
                    }
                },
                search: { // Node 3a: External Search
                    initial: 'querying',
                    states: {
                        querying: {
                            invoke: {
                                src: 'googleSearch',
                                input: ({ context }: { context: MechanicContext }) => ({
                                    service: context.services.search,
                                    data: {
                                        query: `${context.userQuery} ${JSON.stringify(context.vehicleContext)}`,
                                        limit: 3,
                                        userId: context.userId,
                                        sessionId: context.sessionId
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: assign({ searchResults: ({ event }) => event.output })
                                },
                                onError: { target: 'done' }
                            }
                        },
                        done: { type: 'final' }
                    }
                },
                verification: { // Node 3b: Hypothesis Verification
                    initial: 'verifying',
                    states: {
                        verifying: {
                            invoke: {
                                src: 'webVerification',
                                input: ({ context }: { context: MechanicContext }) => ({
                                    service: context.services.chat,
                                    data: {
                                        hypothesis: context.userQuery,
                                        evidence: JSON.stringify(context.vehicleContext),
                                        sessionId: context.sessionId
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: assign({ verificationResult: ({ event }) => event.output })
                                },
                                onError: { target: 'done' }
                            }
                        },
                        done: { type: 'final' }
                    }
                }
            },
            onDone: 'vision_verifying'
        },
        vision_verifying: { // Node 4: Vision Analysis (Contextualized by Search)
            description: "Stage 2: Node 4 (Vision Analysis)",
            invoke: {
                src: 'visionAnalysis',
                input: ({ context }: { context: MechanicContext }) => ({
                    service: context.services.vision,
                    data: {
                        ...context,
                        searchContext: context.searchResults,
                        verificationContext: context.verificationResult
                    }
                }),
                onDone: {
                    target: 'synthesizing',
                    actions: assign({ visualAnalysis: ({ event }) => event.output })
                },
                onError: { target: 'synthesizing' }
            }
        },
        synthesizing: {
            description: "Construct final NeurosymbolicState",
            entry: 'setResult', // Actual logic resides in service, but machine tracks state
            type: 'final'
        }
    }
});
