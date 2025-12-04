import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

// Interfaces
import { IVehicleRepository } from "@/core/interfaces/IVehicleRepository";
import { ISessionRepository } from "@/core/interfaces/ISessionRepository";
import { IVideoDiagnosticAI, IChatAssistantAI } from "@/core/interfaces/IAIService";
import { ILogger } from "@/core/interfaces/ILogger";
import { IDiagnosticService } from "@/core/interfaces/IDiagnosticService";
import { IVehicleInfoProvider } from "@/core/interfaces/IVehicleInfoProvider";

// Implementations (Infrastructure)
import { VehicleAdminRepository } from "../repositories/VehicleAdminRepository";
import { SessionAdminRepository } from "../repositories/SessionAdminRepository";
import { NHTSAVehicleInfoProvider } from "../external/NHTSAVehicleInfoProvider";
import { GeminiProAdapter } from "../ai/GeminiProAdapter";
import { GeminiFlashAdapter } from "../ai/GeminiFlashAdapter";
import { Logger } from "../logging/Logger";

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
    return new GeminiProAdapter(process.env.GCLOUD_PROJECT!);
}).inSingletonScope();

container.bind<IChatAssistantAI>(TYPES.ChatAI).toDynamicValue(() => {
    return new GeminiFlashAdapter(process.env.GCLOUD_PROJECT!);
}).inSingletonScope();

// --- 3. Bind Services (Application) ---
container.bind<VehicleService>(TYPES.VehicleService)
    .to(VehicleService)
    .inSingletonScope();

container.bind<IDiagnosticService>(TYPES.DiagnosticService)
    .to(DiagnosticService)
    .inSingletonScope();

container.bind<StorageService>(TYPES.StorageService).toDynamicValue(() => {
    return new StorageService(process.env.GCLOUD_PROJECT!, process.env.GCLOUD_MEDIA_BUCKET!);
}).inSingletonScope();

// --- 4. Bind Infrastructure Services ---
container.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope();

export { container };
