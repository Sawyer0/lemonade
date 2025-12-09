import "reflect-metadata";
import { Container, ResolutionContext } from "inversify";
import { TYPES } from "./types";

// Interfaces
import { IVehicleRepository } from "@/core/interfaces/IVehicleRepository";
import { ISessionRepository } from "@/core/interfaces/ISessionRepository";
import { IVideoDiagnosticAI, IChatAssistantAI, ISafetyAI } from "@/core/interfaces/IAIService";
import { ILogger } from "@/core/interfaces/ILogger";
import { IVehicleInfoProvider } from "@/core/interfaces/IVehicleInfoProvider";
import { IAuthService } from "@/core/interfaces/IAuthService";
import { IBillingRepository } from "@/core/interfaces/IBillingRepository";
import { IBillingService } from "@/core/interfaces/IBillingService";


// Focused Service Interfaces
import { ISessionService } from "@/core/interfaces/ISessionService";
import { IChatService } from "@/core/interfaces/IChatService";
import { IVideoAnalysisService } from "@/core/interfaces/IVideoAnalysisService";
import { IVoiceService } from "@/core/interfaces/IVoiceService";


// Implementations (Infrastructure)
import { VehicleAdminRepository } from "../repositories/VehicleAdminRepository";
import { SessionAdminRepository } from "../repositories/SessionAdminRepository";
import { NHTSAVehicleInfoProvider } from "../external/NHTSAVehicleInfoProvider";
import { GeminiProAdapter } from "../ai/GeminiProAdapter";
import { GeminiFlashAdapter } from "../ai/GeminiFlashAdapter";
import { SafetyAIAdapter } from "../ai/SafetyAIAdapter";
import { Logger } from "../logging/Logger";
import { AuthService } from "../auth/AuthService";
import { CONFIG } from "@/infrastructure/config";
import { BillingFirestoreRepository } from "../repositories/BillingFirestoreRepository";


// Services (Application)
import { VehicleService } from "@/application/services/VehicleService";
import { StorageService } from "@/infrastructure/storage/StorageService";
import { BillingService } from "@/application/services/BillingService";

// New Focused Services
import { SessionService } from "@/application/services/SessionService";
import { ChatService } from "@/application/services/ChatService";
import { VideoAnalysisService } from "@/application/services/VideoAnalysisService";
import { VoiceService } from "@/application/services/VoiceService";

const container = new Container();

// --- 4. Bind Infrastructure Services (Moved up for dependencies) ---
container.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope();
container.bind<IAuthService>(TYPES.AuthService).to(AuthService).inSingletonScope();


// --- 1. Bind Repositories (Data Layer) ---
container.bind<IVehicleRepository>(TYPES.VehicleRepo)
    .to(VehicleAdminRepository)
    .inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo)
    .to(SessionAdminRepository)
    .inSingletonScope();

import { IServerAuthService } from "@/core/interfaces/IServerAuthService";
import { ServerAuthService } from "@/infrastructure/auth/ServerAuthService";
container.bind<IServerAuthService>(TYPES.ServerAuthService).to(ServerAuthService).inSingletonScope();

container.bind<IVehicleInfoProvider>(TYPES.VehicleInfoProvider)
    .to(NHTSAVehicleInfoProvider)
    .inSingletonScope();

container.bind<IBillingRepository>(TYPES.BillingRepository)
    .to(BillingFirestoreRepository)
    .inSingletonScope();


// --- 2. Bind AI Adapters (The "Brain") ---
container.bind<IVideoDiagnosticAI>(TYPES.VideoAI).toDynamicValue((context: ResolutionContext) => {
    const logger = context.get<ILogger>(TYPES.Logger);
    const billingService = context.get<IBillingService>(TYPES.BillingService);
    return new GeminiProAdapter(CONFIG.GCLOUD.PROJECT_ID, logger, billingService);
}).inSingletonScope();

container.bind<IChatAssistantAI>(TYPES.ChatAI).toDynamicValue((context: ResolutionContext) => {
    const logger = context.get<ILogger>(TYPES.Logger);
    const billingService = context.get<IBillingService>(TYPES.BillingService);
    return new GeminiFlashAdapter(CONFIG.GCLOUD.PROJECT_ID, logger, billingService);
}).inSingletonScope();

container.bind<ISafetyAI>(TYPES.SafetyAI).to(SafetyAIAdapter).inSingletonScope();

// --- 3. Bind Application Services ---
container.bind<VehicleService>(TYPES.VehicleService)
    .to(VehicleService)
    .inSingletonScope();

container.bind<IBillingService>(TYPES.BillingService)
    .to(BillingService)
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

container.bind<IVoiceService>(TYPES.VoiceService)
    .to(VoiceService)
    .inSingletonScope();

container.bind<StorageService>(TYPES.StorageService).toDynamicValue(() => {
    return new StorageService(CONFIG.GCLOUD.PROJECT_ID, CONFIG.GCLOUD.MEDIA_BUCKET);
}).inSingletonScope();

import { ISafetyMonitor } from "@/core/interfaces/ISafetyMonitor";
import { SafetyMonitor } from "@/application/services/SafetyMonitor";
container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

import { IContextCacheService } from "@/core/interfaces/IContextCacheService";
import { ContextCacheService } from "@/infrastructure/ai/ContextCacheService";
container.bind<IContextCacheService>(TYPES.ContextCacheService).to(ContextCacheService).inSingletonScope();



// --- 4. Bind Deep Tech Services (4-Layer Grounding) ---
import { INHTSAService } from "@/core/interfaces/INHTSAService";
import { NHTSAService } from "@/infrastructure/external/NHTSAService";
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();

import { IEmbeddingService } from "@/core/interfaces/IEmbeddingService";
import { EmbeddingService } from "@/infrastructure/ai/EmbeddingService";
container.bind<IEmbeddingService>(TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope();

import { IVectorRepository } from "@/core/interfaces/IVectorRepository";
import { FirestoreVectorRepository } from "@/infrastructure/repositories/FirestoreVectorRepository";
container.bind<IVectorRepository>(TYPES.VectorRepository).to(FirestoreVectorRepository).inSingletonScope();

import { IMechanicReasoningService } from "@/core/interfaces/IMechanicReasoningService";
import { MechanicReasoningService } from "@/application/services/MechanicReasoningService";
container.bind<IMechanicReasoningService>(TYPES.MechanicReasoningService).to(MechanicReasoningService).inSingletonScope();


export { container };
