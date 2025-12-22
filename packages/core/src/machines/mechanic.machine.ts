import { setup, fromPromise, assign, DoneActorEvent, ErrorActorEvent } from 'xstate';
import { NeurosymbolicState } from '../types/neurosymbolic';
import type { IMultimodalUploadAnalyzer, IChatAssistantAI } from '../interfaces/IAIService';
import type { INHTSAService } from '../interfaces/INHTSAService';
import type { IVectorRepository } from '../interfaces/IVectorRepository';
import type { IGoogleSearchService } from '../interfaces/IGoogleSearchService';
import type { IMemoryService, MemorySearchResult } from '../interfaces/IMemoryService';
import type { AIAnalysis, SafetyRecall, VectorDocument } from '../types/models';
import type { VerificationRequest, VerificationResponse, SearchRequest, SearchResponse } from '../types/verification';
import type { LocalTriageResult } from '../types/localPerception';

export interface VisionInput { service: IMultimodalUploadAnalyzer; data: MechanicContext & { searchContext: SearchResponse | undefined; verificationContext: VerificationResponse | undefined } }
export interface NhtsaInput { service: INHTSAService; data: { year: number; make: string; model: string } }
export interface VectorInput { service: IVectorRepository; data: { query: string; userId: string } }
export interface SearchInput { service: IGoogleSearchService; data: SearchRequest }
export interface VerificationInput { service: IChatAssistantAI; data: VerificationRequest }
export interface MemoryInput { service: IMemoryService; data: { query: string; vin?: string } }

export interface MechanicInput {
    sessionId: string;
    userId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string;
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
    | { type: 'DIAGNOSE'; userId: string; sessionId: string; vehicleContext: Record<string, unknown>; userQuery: string; videoUrl?: string; localTriage?: LocalTriageResult }
    | { type: 'UPDATE_SERVICES'; services: MechanicServices };

export const mechanicMachine = setup({
    types: {
        context: {} as MechanicContext,
        events: {} as MechanicEvent,
        input: {} as MechanicInput,
    },
    actors: {
        visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) => input.service.analyzeUploadedVideo(input.data.videoUrl!, JSON.stringify(input.data.vehicleContext), 'video/mp4', input.data.userId, input.data.sessionId)),
        nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => input.service.checkRecalls(input.data.year, input.data.make, input.data.model)),
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
            return input.service.search(`Vehicle VIN: ${input.data.vin || 'Unknown'}. Component/Issue: ${input.data.query}`);
        })
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
        vehicleHistory: [],
    }),
    states: {
        idle: {
            on: {
                DIAGNOSE: {
                    target: 'recalling',
                    actions: assign(({ event }: { event: MechanicEvent }) => {
                        if (event.type === 'DIAGNOSE') {
                            return {
                                sessionId: event.sessionId,
                                userId: event.userId,
                                vehicleContext: event.vehicleContext,
                                userQuery: event.userQuery,
                                videoUrl: event.videoUrl,
                                localTriage: event.localTriage
                            };
                        }
                        return {};
                    })
                },
                UPDATE_SERVICES: {
                    actions: assign(({ event }: { event: MechanicEvent }) => {
                        if (event.type === 'UPDATE_SERVICES') {
                            return { services: event.services };
                        }
                        return {};
                    })
                }
            }
        },
        recalling: {
            description: "Step 0: Recall vehicle history from Supermemory",
            invoke: {
                src: 'supermemorySearch',
                input: ({ context }: { context: MechanicContext }) => ({
                    service: context.services.memory,
                    data: {
                        query: context.userQuery,
                        vin: String(context.vehicleContext.vin || '')
                    }
                }),
                onDone: {
                    target: 'analyzing',
                    actions: assign({ vehicleHistory: ({ event }: { event: DoneActorEvent<MemorySearchResult[]> }) => event.output })
                },
                onError: {
                    target: 'analyzing',
                    actions: assign({ error: ({ event }: { event: ErrorActorEvent }) => (event.error instanceof Error ? event.error.message : String(event.error)) })
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
                                        year: Number(context.vehicleContext.year || 0),
                                        make: String(context.vehicleContext.make || ''),
                                        model: String(context.vehicleContext.model || '')
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: assign({ nhtsaResults: ({ event }: { event: DoneActorEvent<SafetyRecall[]> }) => {
                                        console.log('DEBUG: nhtsaCheck done');
                                        return event.output;
                                    }})
                                },
                                onError: {
                                    target: 'done',
                                    actions: assign({ error: ({ event }: { event: ErrorActorEvent }) => {
                                        console.log('DEBUG: nhtsaCheck error', event.error);
                                        return (event.error instanceof Error ? event.error.message : String(event.error));
                                    }})
                                }
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
                                    actions: assign({ embeddingInfo: ({ event }: { event: DoneActorEvent<VectorDocument[]> }) => {
                                        console.log('DEBUG: vectorSearch done');
                                        return event.output;
                                    }})
                                },
                                onError: {
                                    target: 'done',
                                    actions: assign({ error: ({ event }: { event: ErrorActorEvent }) => {
                                        console.log('DEBUG: vectorSearch error', event.error);
                                        return (event.error instanceof Error ? event.error.message : String(event.error));
                                    }})
                                }
                            }
                        },
                        done: { type: 'final' }
                    }
                },
                search: {
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
                                    actions: assign({ searchResults: ({ event }: { event: DoneActorEvent<SearchResponse> }) => {
                                        console.log('DEBUG: googleSearch done');
                                        return event.output;
                                    }})
                                },
                                onError: {
                                    target: 'done',
                                    actions: assign({ error: ({ event }: { event: ErrorActorEvent }) => {
                                        console.log('DEBUG: googleSearch error', event.error);
                                        return (event.error instanceof Error ? event.error.message : String(event.error));
                                    }})
                                }
                            }
                        },
                        done: { type: 'final' }
                    }
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
                                        hypothesis: context.userQuery,
                                        evidence: JSON.stringify(context.vehicleContext),
                                        sessionId: context.sessionId
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: assign({ verificationResult: ({ event }: { event: DoneActorEvent<VerificationResponse> }) => {
                                        console.log('DEBUG: webVerification done');
                                        return event.output;
                                    }})
                                },
                                onError: {
                                    target: 'done',
                                    actions: assign({ error: ({ event }: { event: ErrorActorEvent }) => {
                                        console.log('DEBUG: webVerification error', event.error);
                                        return (event.error instanceof Error ? event.error.message : String(event.error));
                                    }})
                                }
                            }
                        },
                        done: { type: 'final' }
                    }
                },
                local_grounding: {
                    initial: 'idle',
                    states: {
                        idle: { type: 'final' }
                    }
                }
            },
            onDone: 'vision_verifying'
        },
        vision_verifying: {
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
                    actions: assign({ visualAnalysis: ({ event }: { event: DoneActorEvent<AIAnalysis> }) => event.output })
                },
                onError: {
                    target: 'synthesizing',
                    actions: assign({ error: ({ event }: { event: ErrorActorEvent }) => (event.error instanceof Error ? event.error.message : String(event.error)) })
                }
            }
        },
        synthesizing: {
            description: "Construct final NeurosymbolicState",
            actions: assign({ result: ({ event }: { event: DoneActorEvent<NeurosymbolicState> }) => event.output }),
            type: 'final'
        }
    }
});
