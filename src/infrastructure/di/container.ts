import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

// Core Interfaces
import {
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
    IContextCacheService,
    ISafetyMonitor,
    INHTSAService,
    IEmbeddingService,
    IVectorRepository,
    IMechanicReasoningService,
    IChatAssistantAI,
    IVideoAnalysisService,
    ISessionService,
    IChatService,
    ISummarizationService
} from "@lemonade/core";

// Implementations (Infrastructure)
import { VehicleAdminRepository } from "../repositories/VehicleAdminRepository";
import { SessionAdminRepository } from "../repositories/SessionAdminRepository";
import { FirestoreUserRepository } from "../repositories/FirestoreUserRepository";
import { NHTSAVehicleInfoProvider } from "../external/NHTSAVehicleInfoProvider";
import { GeminiFlashChatAndUploadsAdapter } from "../ai/GeminiFlashChatAndUploadsAdapter";
import { GeminiFlashLiveStreamAdapter } from "../ai/GeminiFlashLiveStreamAdapter";
import { GeminiCoreAdapter } from "../ai/GeminiCoreAdapter";
import { Logger } from "../logging/Logger";
import { AuthService } from "../auth/AuthService";
import { ServerAuthService } from "@/infrastructure/auth/ServerAuthService";
import { BillingFirestoreRepository } from "../repositories/BillingFirestoreRepository";
import { GoogleSearchService } from '@/infrastructure/external/GoogleSearchService';
import { StorageService } from "@/infrastructure/storage/StorageService";
import { ContextCacheService } from "@/infrastructure/ai/ContextCacheService";
import { NHTSAService } from "@/infrastructure/external/NHTSAService";
import { EmbeddingService } from "@/infrastructure/ai/EmbeddingService";
import { FirestoreVectorRepository } from "@/infrastructure/repositories/FirestoreVectorRepository";
import { CONFIG } from "@/infrastructure/config";

// Services (Application)
import { VehicleService } from "@/application/services/VehicleService";
import { BillingService } from "@/application/services/BillingService";
import { SessionService } from "@/application/services/SessionService";
import { ChatService } from "@/application/services/ChatService";
import { VideoAnalysisService } from "@/application/services/VideoAnalysisService";
import { SafetyMonitor } from "@/application/services/SafetyMonitor";
import { MechanicReasoningService } from "@/application/services/MechanicReasoningService";
import { SummarizationService } from "@/application/services/SummarizationService";

import { ComplaintIdentificationService } from "@/application/services/ComplaintIdentificationService";

const container = new Container();

// Bind Logger with optional remote transport
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
container.bind<IChatAssistantAI>(TYPES.ChatAI).to(GeminiFlashChatAndUploadsAdapter).inSingletonScope();
container.bind<IMultimodalUploadAnalyzer>(TYPES.MultimodalUploadAI).to(GeminiFlashChatAndUploadsAdapter).inSingletonScope();
container.bind<ILiveStreamAnalyzer>(TYPES.LiveStreamAI).to(GeminiFlashLiveStreamAdapter).inSingletonScope();
container.bind<IGoogleSearchService>(TYPES.GoogleSearchService).to(GoogleSearchService).inSingletonScope();

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
import { ComplaintIdentificationService } from "@/application/services/ComplaintIdentificationService";

container.bind<ISessionService>(TYPES.SessionService)
    .to(SessionService)
    .inSingletonScope();

container.bind<IChatService>(TYPES.ChatService)
    .to(ChatService)
    .inSingletonScope();

container.bind<IVideoAnalysisService>(TYPES.VideoAnalysisService)
    .to(VideoAnalysisService)
    .inSingletonScope();

container.bind<ComplaintIdentificationService>(TYPES.ComplaintIdentificationService)
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

container.bind<IEmbeddingService>(TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope();

container.bind<IVectorRepository>(TYPES.VectorRepository).to(FirestoreVectorRepository).inSingletonScope();

container.bind<IMechanicReasoningService>(TYPES.MechanicReasoningService).to(MechanicReasoningService).inSingletonScope();


export { container };