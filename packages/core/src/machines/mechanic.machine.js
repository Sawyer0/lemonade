"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mechanicMachine = void 0;
const xstate_1 = require("xstate");
exports.mechanicMachine = (0, xstate_1.setup)({
    types: {
        context: {},
        events: {},
        input: {},
    },
    actions: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError: (0, xstate_1.assign)({ error: ({ event }) => event.error.message }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setResult: (0, xstate_1.assign)({ result: ({ event }) => event.output }),
    },
    actors: {
        visionAnalysis: (0, xstate_1.fromPromise)(async ({ input }) => input.service.analyzeUploadedVideo(input.data.videoUrl, JSON.stringify(input.data.vehicleContext), 'video/mp4', input.data.userId, input.data.sessionId)),
        nhtsaCheck: (0, xstate_1.fromPromise)(async ({ input }) => input.service.checkRecalls(input.data.year, input.data.make, input.data.model)),
        vectorSearch: (0, xstate_1.fromPromise)(async ({ input }) => {
            return input.service.search(input.data.query, 3, { userId: input.data.userId });
        }),
        // Actor 4: Web Search (Google)
        googleSearch: (0, xstate_1.fromPromise)(async ({ input }) => {
            return input.service.search(input.data);
        }),
        // Actor 5: Hypothesis Verification (LLM)
        webVerification: (0, xstate_1.fromPromise)(async ({ input }) => {
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
                    actions: (0, xstate_1.assign)({
                        sessionId: ({ event }) => event.sessionId,
                        userId: ({ event }) => event.userId,
                        vehicleContext: ({ event }) => event.vehicleContext,
                        userQuery: ({ event }) => event.userQuery,
                        videoUrl: ({ event }) => event.videoUrl
                    })
                },
                UPDATE_SERVICES: {
                    actions: (0, xstate_1.assign)({
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
                                input: ({ context }) => ({
                                    service: context.services.nhtsa,
                                    data: {
                                        year: Number(context.vehicleContext.year || 0),
                                        make: String(context.vehicleContext.make || ''),
                                        model: String(context.vehicleContext.model || '')
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: (0, xstate_1.assign)({ nhtsaResults: ({ event }) => event.output })
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
                                input: ({ context }) => ({ service: context.services.vector, data: { query: context.userQuery, userId: context.userId } }),
                                onDone: {
                                    target: 'done',
                                    actions: (0, xstate_1.assign)({ embeddingInfo: ({ event }) => event.output })
                                },
                                onError: { target: 'done' }
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
                                input: ({ context }) => ({
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
                                    actions: (0, xstate_1.assign)({ searchResults: ({ event }) => event.output })
                                },
                                onError: { target: 'done' }
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
                                input: ({ context }) => ({
                                    service: context.services.chat,
                                    data: {
                                        hypothesis: context.userQuery,
                                        evidence: JSON.stringify(context.vehicleContext),
                                        sessionId: context.sessionId
                                    }
                                }),
                                onDone: {
                                    target: 'done',
                                    actions: (0, xstate_1.assign)({ verificationResult: ({ event }) => event.output })
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
        vision_verifying: {
            description: "Stage 2: Node 4 (Vision Analysis)",
            invoke: {
                src: 'visionAnalysis',
                input: ({ context }) => ({
                    service: context.services.vision,
                    data: {
                        ...context,
                        searchContext: context.searchResults,
                        verificationContext: context.verificationResult
                    }
                }),
                onDone: {
                    target: 'synthesizing',
                    actions: (0, xstate_1.assign)({ visualAnalysis: ({ event }) => event.output })
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
