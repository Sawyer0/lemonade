import { useEffect, useMemo } from 'react';
import { useMachine } from '@xstate/react';
import {
    mechanicMachine,
    AIAnalysis,
    ILogger,
    VisionInput,
    IntuitionInput,
    GatherAllContextInput,
    GatherAllContextOutput,
    NhtsaInput,
    VectorInput,
    SearchInput,
    SearchResponse,
    VerificationInput,
    VerificationResponse,
    MemoryInput,
    MemorySearchResult,
} from '@lemonade/core';
import { LocalPerceptionService } from '../services/LocalPerceptionService';
import { PerformanceMonitor } from '../services/PerformanceMonitor';
import { CONFIG } from '../constants/config';
import * as FileSystem from 'expo-file-system/legacy';
import { fromPromise } from 'xstate';
import {
    MobileVisionAdapter,
    MobileChatAdapter,
    MobileNHTSAAdapter,
    MobileVectorAdapter,
    MobileSearchAdapter,
    MobileMemoryAdapter,
} from '../services/MobileServiceAdapters';

// Mock Logger for mobile
class ConsoleLogger implements ILogger {
    debug(message: string, ...meta: unknown[]) {
        console.debug(message, ...meta);
    }
    info(message: string, ...meta: unknown[]) {
        console.info(message, ...meta);
    }
    warn(message: string, ...meta: unknown[]) {
        console.warn(message, ...meta);
    }
    error(message: string, ...meta: unknown[]) {
        console.error(message, ...meta);
    }
}

export function useMechanicAgent(sessionId: string, userId: string) {
    // 1. Initialize Infrastructure
    const logger = useMemo(() => new ConsoleLogger(), []);

    // Services
    const perceptionService = useMemo(() => {
        const perfMonitor = new PerformanceMonitor(logger);
        return new LocalPerceptionService(logger, perfMonitor);
    }, [logger]);

    const mobileServices = useMemo(
        () => ({
            vision: new MobileVisionAdapter(),
            chat: new MobileChatAdapter(),
            nhtsa: new MobileNHTSAAdapter(),
            vector: new MobileVectorAdapter(),
            search: new MobileSearchAdapter(),
            memory: new MobileMemoryAdapter(),
        }),
        [],
    );

    // 2. Use XState Machine
    const [state, send] = useMachine(
        mechanicMachine.provide({
            actions: {
                loadVisionModel: async () => {
                    const modelPath = `${FileSystem.documentDirectory}${CONFIG.LOCAL_INFERENCE.MODEL_FILENAME}`;
                    logger.info('[MobileAgent] Action: loadVisionModel', { path: modelPath });

                    try {
                        await perceptionService.initialize(modelPath);
                    } catch (e) {
                        logger.error('[MobileAgent] Model Load Failed', e);
                    }
                },
                unloadVisionModel: async () => {
                    logger.info('[MobileAgent] Action: unloadVisionModel');
                    await perceptionService.dispose();
                },
            },
            actors: {
                generateIntuition: fromPromise<AIAnalysis, IntuitionInput>(async () => {
                    // In a real hybrid app, this would call the backend reasoning endpoint
                    throw new Error('generateIntuition: Should be delegated to Server Agent');
                }),
                visionAnalysis: fromPromise<AIAnalysis, VisionInput>(async ({ input }) => {
                    // Use the adapter
                    if (!input.data.videoUrl) return Promise.resolve(input.data.visualAnalysis as AIAnalysis);
                    return mobileServices.vision.analyzeUploadedVideo(
                        input.data.videoUrl,
                        JSON.stringify(input.data.vehicleContext),
                        'video/mp4',
                        input.data.userId,
                        input.data.sessionId,
                    );
                }),
                nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => {
                    return mobileServices.nhtsa.checkRecalls(input.data.year, input.data.make, input.data.model);
                }),
                vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
                    return mobileServices.vector.search(input.data.query, 3, { userId: input.data.userId });
                }),
                googleSearch: fromPromise<SearchResponse, SearchInput>(async ({ input }) => {
                    return mobileServices.search.search(input.data);
                }),
                webVerification: fromPromise<VerificationResponse, VerificationInput>(async ({ input }) => {
                    return mobileServices.chat.verifyHypothesis(input.data);
                }),
                supermemorySearch: fromPromise<MemorySearchResult[], MemoryInput>(async ({ input }) => {
                    // Note: mechanic.machine.ts was updated to use tags, but MobileMemoryAdapter stub needs to match signature
                    return mobileServices.memory.search(input.data.query);
                }),
                gatherAllContext: fromPromise<GatherAllContextOutput, GatherAllContextInput>(async ({ input }) => {
                    const [recalls, history, vectors] = await Promise.all([
                        mobileServices.nhtsa.checkRecalls(
                            Number(input.vehicleContext.year || 0),
                            String(input.vehicleContext.make || ''),
                            String(input.vehicleContext.model || ''),
                        ),
                        mobileServices.memory.search(
                            `Vehicle VIN: ${input.vehicleContext.vin || 'Unknown'}. Component/Issue: ${input.userQuery}`,
                        ),
                        mobileServices.vector.search(input.userQuery, 3, { userId: input.userId }),
                    ]);
                    return { recalls, history, vectors };
                }),
            },
        }),
        {
            input: {
                sessionId,
                userId,
                vehicleContext: {},
                userQuery: '',
                services: mobileServices,
            },
        },
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            logger.info('[MobileAgent] Unmounting - Cleaning up resources');
            perceptionService.dispose();
        };
    }, [logger, perceptionService]);

    return {
        state,
        send,
        service: perceptionService,
    };
}
