import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types';
import type {
    IBillingRepository,
    IBillingService,
    IEmbeddingService,
    IGoogleSearchService,
    ILogger,
    IMemoryService,
    INHTSAService,
    IResponseCache,
    ISafetyMonitor,
    ISessionRepository,
    IUserRepository,
    IVectorRepository,
    IVehicleRepository,
} from '@lemonade/core';
import {
    BillingFirestoreRepository,
    BillingService,
    EmbeddingService,
    EnvConfigProvider,
    FirestoreSessionRepository,
    FirestoreUserRepository,
    FirestoreVehicleRepository,
    FunctionCallService,
    GeminiCoreAdapter,
    GoogleSearchService,
    InMemoryResponseCache,
    Logger,
    NHTSAService,
    SafetyMonitor,
    SupermemoryService,
    TracingService,
    VectorRepository,
    TYPES as INFRA_TYPES,
    bindAiProviders,
} from '@lemonade/infrastructure';
import { VideoAnalysisService } from '../../application/services/VideoAnalysisService';

/**
 * Cloud Functions container. Models come from the same provider-neutral
 * bindings as the web app (LLM_PROVIDER: vertex, groq or offline), so the video
 * trigger analyzes uploads through the MultimodalUploadAI port.
 */
export function createContainer(): Container {
    const container = new Container();

    container.bind(INFRA_TYPES.ConfigProvider).to(EnvConfigProvider).inSingletonScope();
    container.bind(INFRA_TYPES.TracingService).to(TracingService).inSingletonScope();
    container.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope();
    container.bind<GeminiCoreAdapter>(INFRA_TYPES.GeminiCoreAdapter).to(GeminiCoreAdapter).inSingletonScope();
    container.bind<FunctionCallService>(INFRA_TYPES.FunctionCallService).to(FunctionCallService).inSingletonScope();
    container.bind<IGoogleSearchService>(INFRA_TYPES.GoogleSearchService).to(GoogleSearchService).inSingletonScope();
    container.bind<IMemoryService>(INFRA_TYPES.SupermemoryService).to(SupermemoryService).inSingletonScope();
    container.bind<IResponseCache>(INFRA_TYPES.ResponseCache).toConstantValue(new InMemoryResponseCache());

    container.bind<ISessionRepository>(TYPES.SessionRepo).to(FirestoreSessionRepository).inSingletonScope();
    container.bind<IVehicleRepository>(TYPES.VehicleRepo).to(FirestoreVehicleRepository).inSingletonScope();
    container.bind<IUserRepository>(INFRA_TYPES.UserRepo).to(FirestoreUserRepository).inSingletonScope();
    container.bind<IBillingRepository>(INFRA_TYPES.BillingRepository).to(BillingFirestoreRepository).inSingletonScope();
    container.bind<IBillingService>(INFRA_TYPES.BillingService).to(BillingService).inSingletonScope();
    container.bind<IEmbeddingService>(INFRA_TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope();
    container.bind<IVectorRepository>(TYPES.VectorRepo).to(VectorRepository).inSingletonScope();
    container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();
    container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

    bindAiProviders(container);
    container.bind(TYPES.VideoAI).toService(INFRA_TYPES.MultimodalUploadAI);

    container.bind<VideoAnalysisService>(TYPES.VideoService).to(VideoAnalysisService).inSingletonScope();
    return container;
}

export const container = createContainer();
