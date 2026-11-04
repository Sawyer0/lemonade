import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

// Core Interfaces
import type {
    IVehicleRepository,
    ISessionRepository,
    IMultimodalUploadAnalyzer,
    ILiveStreamAnalyzer,
    ILogger,
    IVehicleInfoProvider,
    IAuthService,
    IUserRepository,
    IBillingRepository,
    IBillingService,
    IServerAuthService,
    IGoogleSearchService,
    IMemoryService,
    IContextCacheService,
    ISafetyMonitor,
    INHTSAService,
    IEmbeddingService,
    IVectorRepository,
    IMechanicReasoningService,
    IChatAssistantAI,
    IVideoAnalysisService,
    IReactiveSafetyService,
    ISessionService,
    IChatService,
    ISummarizationService,
    ISafetyAI,
    IEdgeSecurityService,
    IRateLimiter,
    IComplaintIdentificationService
} from "@lemonade/core";

// Implementations (Shared Infrastructure)
import {
    FirestoreVehicleRepository as VehicleAdminRepository,
    FirestoreSessionRepository as SessionAdminRepository,
    FirestoreUserRepository,
    GeminiFlashChatAndUploadsAdapter,
    GeminiFlashLiveStreamAdapter,
    GeminiCoreAdapter,
    Logger,
    BillingFirestoreRepository,
    GoogleSearchService,
    ContextCacheService,
    BillingService,
    EnvConfigProvider,
    TracingService,
    EvalRunner,
    SupermemoryService,
    ReactiveSafetyService,
    MechanicReasoningService,
    VertexAISafetyAdapter,
    FunctionCallService,
    EdgeSecurityService,
    UpstashRateLimiter,
    CompletionChatAdapter,
    CompletionSafetyAdapter,
    createGroqClient,
    resolveLlmProvider
} from "@lemonade/infrastructure";

// Implementations (Local / Web-specific)
import { AuthService } from "../auth/AuthService";
import { ServerAuthService } from "@/infrastructure/auth/ServerAuthService";
import { StorageService } from "@/infrastructure/storage/StorageService";
import { NHTSAService } from "@/infrastructure/external/NHTSAService";
import { EmbeddingService } from "@/infrastructure/ai/EmbeddingService";
import { FirestoreVectorRepository } from "@/infrastructure/repositories/FirestoreVectorRepository";
import { CONFIG } from "@/infrastructure/config";
import { NHTSAVehicleInfoProvider } from "../external/NHTSAVehicleInfoProvider";

// Services (Application)
import { VehicleService } from "@/application/services/VehicleService";
import { SessionService } from "@/application/services/SessionService";
import { ChatService } from "@/application/services/ChatService";
import { VideoAnalysisService } from "@/application/services/VideoAnalysisService";
import { SafetyMonitor } from "@/application/services/SafetyMonitor";
import { SummarizationService } from "@/application/services/SummarizationService";
import { ComplaintIdentificationService } from "@/application/services/ComplaintIdentificationService";

const container = new Container();

// --- 0. Bind Shared Infrastructure Utils ---
container.bind(TYPES.ConfigProvider).to(EnvConfigProvider).inSingletonScope();
container.bind(TYPES.TracingService).to(TracingService).inSingletonScope();
container.bind(TYPES.EvalRunner).to(EvalRunner).inSingletonScope();

// Bind Logger
container.bind<ILogger>(TYPES.Logger).toDynamicValue(() => {
    return new Logger(undefined);
}).inSingletonScope();

container.bind<IAuthService>(TYPES.AuthService).to(AuthService).inSingletonScope();

container.bind<GeminiCoreAdapter>(TYPES.GeminiCoreAdapter).to(GeminiCoreAdapter).inSingletonScope();


// --- 1. Bind Repositories (Data Layer) ---
container.bind<IVehicleRepository>(TYPES.VehicleRepo)
    .to(VehicleAdminRepository)
    .inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo)
    .to(SessionAdminRepository)
    .inSingletonScope();

container.bind<IUserRepository>(TYPES.UserRepo)
    .to(FirestoreUserRepository)
    .inSingletonScope();

container.bind<IServerAuthService>(TYPES.ServerAuthService).to(ServerAuthService).inSingletonScope();

container.bind<IVehicleInfoProvider>(TYPES.VehicleInfoProvider)
    .to(NHTSAVehicleInfoProvider)
    .inSingletonScope();

container.bind<IBillingRepository>(TYPES.BillingRepository)
    .to(BillingFirestoreRepository)
    .inSingletonScope();



// --- 2. Bind AI Adapters (The "Brain") ---
// Chat and System 1 safety use Vertex AI by default; LLM_PROVIDER=groq switches
// them to Groq's free OpenAI-compatible API (GROQ_API_KEY required).
if (resolveLlmProvider() === "groq") {
    container.bind<IChatAssistantAI>(TYPES.ChatAI)
        .toDynamicValue(() => new CompletionChatAdapter(createGroqClient()))
        .inSingletonScope();
    container.bind<ISafetyAI>(TYPES.SafetyAI)
        .toDynamicValue(() => new CompletionSafetyAdapter(createGroqClient()))
        .inSingletonScope();
} else {
    container.bind<IChatAssistantAI>(TYPES.ChatAI).to(GeminiFlashChatAndUploadsAdapter).inSingletonScope();
    container.bind<ISafetyAI>(TYPES.SafetyAI).to(VertexAISafetyAdapter).inSingletonScope();
}
container.bind<IMultimodalUploadAnalyzer>(TYPES.MultimodalUploadAI).to(GeminiFlashChatAndUploadsAdapter).inSingletonScope();
container.bind<ILiveStreamAnalyzer>(TYPES.LiveStreamAI).to(GeminiFlashLiveStreamAdapter).inSingletonScope();
container.bind<IGoogleSearchService>(TYPES.GoogleSearchService).to(GoogleSearchService).inSingletonScope();
container.bind<IMemoryService>(TYPES.SupermemoryService).to(SupermemoryService).inSingletonScope();
container.bind<FunctionCallService>(TYPES.FunctionCallService).to(FunctionCallService).inSingletonScope();

// --- 3. Bind Core Services (The "Logic") ---
container.bind<VehicleService>(TYPES.VehicleService)
    .to(VehicleService)
    .inSingletonScope();

container.bind<IBillingService>(TYPES.BillingService)
    .to(BillingService)
    .inSingletonScope();

container.bind<ISummarizationService>(TYPES.SummarizationService)
    .to(SummarizationService)
    .inSingletonScope();

// Bind focused interfaces to their specific implementations
container.bind<ISessionService>(TYPES.SessionService)
    .to(SessionService)
    .inSingletonScope();

container.bind<IChatService>(TYPES.ChatService)
    .to(ChatService)
    .inSingletonScope();

container.bind<IVideoAnalysisService>(TYPES.VideoAnalysisService)
    .to(VideoAnalysisService)
    .inSingletonScope();

container.bind<IComplaintIdentificationService>(TYPES.ComplaintIdentificationService)
    .to(ComplaintIdentificationService)
    .inSingletonScope();


container.bind<StorageService>(TYPES.StorageService).toDynamicValue(() => {
    const logger = container.get<ILogger>(TYPES.Logger);
    return new StorageService(CONFIG.GCLOUD.PROJECT_ID, CONFIG.GCLOUD.MEDIA_BUCKET, logger);
}).inSingletonScope();

container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

container.bind<IContextCacheService>(TYPES.ContextCacheService).to(ContextCacheService).inSingletonScope();

// --- 4. Bind Deep Tech Services (4-Layer Grounding) ---
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();

container.bind<IReactiveSafetyService>(TYPES.ReactiveSafetyService).to(ReactiveSafetyService).inSingletonScope();

container.bind<IEmbeddingService>(TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope();

container.bind<IVectorRepository>(TYPES.VectorRepository).to(FirestoreVectorRepository).inSingletonScope();

container.bind<IMechanicReasoningService>(TYPES.MechanicReasoningService).to(MechanicReasoningService).inSingletonScope();

container.bind<IEdgeSecurityService>(TYPES.EdgeSecurityService).to(EdgeSecurityService).inSingletonScope();
container.bind<IRateLimiter>(TYPES.RateLimiter).to(UpstashRateLimiter).inSingletonScope();

export { container };
