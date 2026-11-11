import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types';

// Core Interfaces
import type {
    IVehicleRepository,
    ISessionRepository,
    ILogger,
    IVehicleInfoProvider,
    IAuthService,
    IUserRepository,
    IBillingRepository,
    IBillingService,
    IServerAuthService,
    IGoogleSearchService,
    IMemoryService,
    IResponseCache,
    ISafetyMonitor,
    INHTSAService,
    IEmbeddingService,
    IVectorRepository,
    IMechanicReasoningService,
    IVideoAnalysisService,
    IReactiveSafetyService,
    ISessionService,
    ICaseService,
    IChatService,
    ISummarizationService,
    IEdgeSecurityService,
    IRateLimiter,
    IComplaintIdentificationService,
} from '@lemonade/core';

// Implementations (Shared Infrastructure)
import {
    FirestoreVehicleRepository as VehicleAdminRepository,
    FirestoreSessionRepository as SessionAdminRepository,
    FirestoreUserRepository,
    GeminiCoreAdapter,
    Logger,
    BillingFirestoreRepository,
    TavilySearchService,
    InMemoryResponseCache,
    BillingService,
    EnvConfigProvider,
    TracingService,
    EvalRunner,
    SupermemoryService,
    ReactiveSafetyService,
    MechanicReasoningService,
    CaseRunCoordinator,
    FunctionCallService,
    EdgeSecurityService,
    UpstashRateLimiter,
    SafetyMonitor,
    NHTSAService,
    EmbeddingService,
    bindAiProviders,
    bindCaseLedger,
} from '@lemonade/infrastructure';

// Implementations (Local / Web-specific)
import { AuthService } from '../auth/AuthService';
import { ServerAuthService } from '@/infrastructure/auth/ServerAuthService';
import { StorageService } from '@/infrastructure/storage/StorageService';
import { FirestoreVectorRepository } from '@/infrastructure/repositories/FirestoreVectorRepository';
import { CONFIG } from '@/infrastructure/config';

// Services (Application)
import { VehicleService } from '@/application/services/VehicleService';
import { SessionService } from '@/application/services/SessionService';
import { CaseService } from '@/application/services/CaseService';
import { ChatService } from '@/application/services/ChatService';
import { VideoAnalysisService } from '@/application/services/VideoAnalysisService';
import { SummarizationService } from '@/application/services/SummarizationService';
import { ComplaintIdentificationService } from '@/application/services/ComplaintIdentificationService';

const container = new Container();

// --- 0. Bind Shared Infrastructure Utils ---
container.bind(TYPES.ConfigProvider).to(EnvConfigProvider).inSingletonScope();
container.bind(TYPES.TracingService).to(TracingService).inSingletonScope();
container.bind(TYPES.EvalRunner).to(EvalRunner).inSingletonScope();

// Bind Logger
container
    .bind<ILogger>(TYPES.Logger)
    .toDynamicValue(() => {
        return new Logger(undefined);
    })
    .inSingletonScope();

container.bind<IAuthService>(TYPES.AuthService).to(AuthService).inSingletonScope();

container.bind<GeminiCoreAdapter>(TYPES.GeminiCoreAdapter).to(GeminiCoreAdapter).inSingletonScope();

// --- 1. Bind Repositories (Data Layer) ---
container.bind<IVehicleRepository>(TYPES.VehicleRepo).to(VehicleAdminRepository).inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo).to(SessionAdminRepository).inSingletonScope();

// Case ledger (Postgres). Shared bindings — see caseLedgerBindings.ts in
// @lemonade/infrastructure.
bindCaseLedger(container);

container.bind<IUserRepository>(TYPES.UserRepo).to(FirestoreUserRepository).inSingletonScope();

container.bind<IServerAuthService>(TYPES.ServerAuthService).to(ServerAuthService).inSingletonScope();

// NHTSAService decodes VINs through vPIC, so it also serves as the vehicle info provider.
container.bind<IVehicleInfoProvider>(TYPES.VehicleInfoProvider).toService(TYPES.NHTSAService);

container.bind<IBillingRepository>(TYPES.BillingRepository).to(BillingFirestoreRepository).inSingletonScope();

// --- 2. Bind AI Adapters (The "Brain") ---
// Chat, System 1 safety and the media model use Vertex AI by default;
// LLM_PROVIDER=groq switches them to Groq (GROQ_API_KEY required).
bindAiProviders(container);
container.bind<IGoogleSearchService>(TYPES.GoogleSearchService).to(TavilySearchService).inSingletonScope();
container.bind<IMemoryService>(TYPES.SupermemoryService).to(SupermemoryService).inSingletonScope();
container.bind<FunctionCallService>(TYPES.FunctionCallService).to(FunctionCallService).inSingletonScope();

// --- 3. Bind Core Services (The "Logic") ---
container.bind<VehicleService>(TYPES.VehicleService).to(VehicleService).inSingletonScope();

container.bind<IBillingService>(TYPES.BillingService).to(BillingService).inSingletonScope();

container.bind<ISummarizationService>(TYPES.SummarizationService).to(SummarizationService).inSingletonScope();

// Bind focused interfaces to their specific implementations
container.bind<ISessionService>(TYPES.SessionService).to(SessionService).inSingletonScope();

container.bind<ICaseService>(TYPES.CaseService).to(CaseService).inSingletonScope();

container.bind<IChatService>(TYPES.ChatService).to(ChatService).inSingletonScope();

container.bind<IVideoAnalysisService>(TYPES.VideoAnalysisService).to(VideoAnalysisService).inSingletonScope();

container
    .bind<IComplaintIdentificationService>(TYPES.ComplaintIdentificationService)
    .to(ComplaintIdentificationService)
    .inSingletonScope();

container
    .bind<StorageService>(TYPES.StorageService)
    .toDynamicValue(() => {
        const logger = container.get<ILogger>(TYPES.Logger);
        return new StorageService(CONFIG.GCLOUD.PROJECT_ID, CONFIG.GCLOUD.MEDIA_BUCKET, logger);
    })
    .inSingletonScope();

container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

container.bind<IResponseCache>(TYPES.ResponseCache).toConstantValue(new InMemoryResponseCache());

// --- 4. Bind Deep Tech Services (4-Layer Grounding) ---
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();

container.bind<IReactiveSafetyService>(TYPES.ReactiveSafetyService).to(ReactiveSafetyService).inSingletonScope();

container.bind<IEmbeddingService>(TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope();

container.bind<IVectorRepository>(TYPES.VectorRepository).to(FirestoreVectorRepository).inSingletonScope();

container
    .bind<IMechanicReasoningService>(TYPES.MechanicReasoningService)
    .to(MechanicReasoningService)
    .inSingletonScope();

// LM-17: one coordinator per process, so the single-active-run rule holds
// across every caller that resolves the reasoning service.
container.bind<CaseRunCoordinator>(TYPES.CaseRunCoordinator).to(CaseRunCoordinator).inSingletonScope();

container.bind<IEdgeSecurityService>(TYPES.EdgeSecurityService).to(EdgeSecurityService).inSingletonScope();
container.bind<IRateLimiter>(TYPES.RateLimiter).to(UpstashRateLimiter).inSingletonScope();

export { container };
