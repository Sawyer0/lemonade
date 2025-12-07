import "server-only";
import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

// Interfaces
import { IVehicleRepository } from "@/core/interfaces/IVehicleRepository";
import { ISessionRepository } from "@/core/interfaces/ISessionRepository";
import { IVideoDiagnosticAI, IChatAssistantAI } from "@/core/interfaces/IAIService";
import { ILogger } from "@/core/interfaces/ILogger";
import { IVehicleInfoProvider } from "@/core/interfaces/IVehicleInfoProvider";
import { IAuthService } from "@/core/interfaces/IAuthService";

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
import { Logger } from "../logging/Logger";
import { AuthService } from "../auth/AuthService";
import { CONFIG } from "@/infrastructure/config";

// Services (Application)
import { VehicleService } from "@/application/services/VehicleService";
import { DiagnosticService } from "@/application/services/DiagnosticService";
import { StorageService } from "@/infrastructure/storage/StorageService";

const container = new Container();

// --- 1. Bind Repositories (Data Layer) ---
container.bind<IVehicleRepository>(TYPES.VehicleRepo)
    .to(VehicleAdminRepository)
    .inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo)
    .to(SessionAdminRepository)
    .inSingletonScope();

container.bind<IVehicleInfoProvider>(TYPES.VehicleInfoProvider)
    .to(NHTSAVehicleInfoProvider)
    .inSingletonScope();

// --- 2. Bind AI Adapters (The "Brain") ---
container.bind<IVideoDiagnosticAI>(TYPES.VideoAI).toDynamicValue(() => {
    return new GeminiProAdapter(CONFIG.GCLOUD.PROJECT_ID);
}).inSingletonScope();

container.bind<IChatAssistantAI>(TYPES.ChatAI).toDynamicValue(() => {
    return new GeminiFlashAdapter(CONFIG.GCLOUD.PROJECT_ID);
}).inSingletonScope();

// --- 3. Bind Application Services ---
container.bind<VehicleService>(TYPES.VehicleService)
    .to(VehicleService)
    .inSingletonScope();

// DiagnosticService implements all focused interfaces
container.bind<DiagnosticService>(TYPES.DiagnosticService)
    .to(DiagnosticService)
    .inSingletonScope();

// Bind focused interfaces to the same DiagnosticService instance
// This allows gradual migration to focused interfaces
container.bind<ISessionService>(TYPES.SessionService)
    .toDynamicValue(() => container.get<DiagnosticService>(TYPES.DiagnosticService))
    .inSingletonScope();

container.bind<IChatService>(TYPES.ChatService)
    .toDynamicValue(() => container.get<DiagnosticService>(TYPES.DiagnosticService))
    .inSingletonScope();

container.bind<IVideoAnalysisService>(TYPES.VideoAnalysisService)
    .toDynamicValue(() => container.get<DiagnosticService>(TYPES.DiagnosticService))
    .inSingletonScope();

container.bind<IVoiceService>(TYPES.VoiceService)
    .toDynamicValue(() => container.get<DiagnosticService>(TYPES.DiagnosticService))
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

// --- 4. Bind Infrastructure Services ---
container.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope();
container.bind<IAuthService>(TYPES.AuthService).to(AuthService).inSingletonScope();

export { container };
