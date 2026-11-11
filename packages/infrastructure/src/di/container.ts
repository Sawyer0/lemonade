import 'reflect-metadata';
import { Container } from 'inversify';
import {
    ILogger,
    IMechanicReasoningService,
    ISessionRepository,
    IGoogleSearchService,
    IMemoryService,
    IReactiveSafetyService,
    ISafetyMonitor,
    ITracingService,
    INHTSAService,
    IVectorRepository,
    IEmbeddingService,
    IUserRepository,
    IBillingService,
    IBillingRepository,
    IResponseCache,
} from '@lemonade/core';
import { IConfigProvider } from '../interfaces/IConfigProvider';
import { TYPES } from './types';

// Implementations
import { MechanicReasoningService } from '../services/MechanicReasoningService';
import { FirestoreSessionRepository } from '../repositories/FirestoreSessionRepository';
import { TavilySearchService } from '../external/TavilySearchService';
import { SupermemoryService } from '../external/SupermemoryService';
import { ReactiveSafetyService } from '../services/ReactiveSafetyService';
import { SafetyMonitor } from '../ai/SafetyMonitor';
import { TracingService } from '../observability/TracingService';
import { NHTSAService } from '../external/NHTSAService';
import { VectorRepository } from '../repositories/VectorRepository';
import { EmbeddingService } from '../ai/EmbeddingService';
import { EnvConfigProvider } from '../config/EnvConfigProvider';
import { Logger } from '../logging/Logger';

// AI Adapters
import { bindAiProviders } from './aiBindings';
import { FirestoreUserRepository } from '../repositories/FirestoreUserRepository';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';
import { FunctionCallService } from '../ai/FunctionCallHandler';
import { BillingService } from '../services/BillingService';
import { BillingFirestoreRepository } from '../repositories/BillingFirestoreRepository';
import { InMemoryResponseCache } from '../cache/InMemoryResponseCache';

import { bindCaseLedger } from './caseLedgerBindings';

export function createContainer(): Container {
    const container = new Container();

    // 1. Core / Utils
    container.bind<IConfigProvider>(TYPES.ConfigProvider).to(EnvConfigProvider).inSingletonScope();
    container
        .bind<ILogger>(TYPES.Logger)
        .toDynamicValue(() => new Logger(undefined))
        .inSingletonScope();
    container.bind<ITracingService>(TYPES.TracingService).to(TracingService).inSingletonScope();

    // Core Adapter for Vertex/Gemini
    container.bind<GeminiCoreAdapter>(TYPES.GeminiCoreAdapter).to(GeminiCoreAdapter).inSingletonScope();
    container.bind<IResponseCache>(TYPES.ResponseCache).toConstantValue(new InMemoryResponseCache());
    container.bind<FunctionCallService>(TYPES.FunctionCallService).to(FunctionCallService).inSingletonScope();

    // Billing
    container.bind<IBillingRepository>(TYPES.BillingRepository).to(BillingFirestoreRepository).inSingletonScope();
    container.bind<IBillingService>(TYPES.BillingService).to(BillingService).inSingletonScope();

    // 2. AI Adapters (provider chosen by LLM_PROVIDER)
    bindAiProviders(container);

    // 3. Services & Repositories
    container.bind<ISessionRepository>(TYPES.SessionRepository).to(FirestoreSessionRepository).inSingletonScope();
    // Case ledger (Postgres). Shared bindings — see caseLedgerBindings.ts.
    bindCaseLedger(container);
    container.bind<IUserRepository>(TYPES.UserRepo).to(FirestoreUserRepository).inSingletonScope();
    container.bind<IGoogleSearchService>(TYPES.GoogleSearchService).to(TavilySearchService).inSingletonScope();
    container.bind<IMemoryService>(TYPES.SupermemoryService).to(SupermemoryService).inSingletonScope();
    container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();

    // 4. Vector / Knowledge
    container.bind<IEmbeddingService>(TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope();
    container.bind<IVectorRepository>(TYPES.VectorRepository).to(VectorRepository).inSingletonScope();

    // 5. Safety Systems
    container.bind<IReactiveSafetyService>(TYPES.ReactiveSafetyService).to(ReactiveSafetyService).inSingletonScope();
    container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

    // 6. Reasoning Core
    container
        .bind<IMechanicReasoningService>(TYPES.MechanicReasoningService)
        .to(MechanicReasoningService)
        .inSingletonScope();

    return container;
}
