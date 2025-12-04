import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";

// Interfaces
import { IVehicleRepository } from "@/core/interfaces/IVehicleRepository";
import { ISessionRepository } from "@/core/interfaces/ISessionRepository";
import { IVideoDiagnosticAI, IChatAssistantAI } from "@/core/interfaces/IAIService";

// Implementations (Infrastructure)
import { VehicleFirestoreRepository } from "../repositories/VehicleFirestoreRepository";
import { SessionFirestoreRepository } from "../repositories/SessionFirestoreRepository";
import { GeminiProAdapter } from "../ai/GeminiProAdapter";
import { GeminiFlashAdapter } from "../ai/GeminiFlashAdapter";

// Services (Application) - We will bind these as we create them
// import { DiagnosticService } from '@/application/services/DiagnosticService';
// import { VehicleService } from '@/application/services/VehicleService';

const container = new Container();

// --- 1. Bind Repositories (Data Layer) ---
container.bind<IVehicleRepository>(TYPES.VehicleRepo)
    .to(VehicleFirestoreRepository)
    .inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo)
    .to(SessionFirestoreRepository)
    .inSingletonScope();

// --- 2. Bind AI Adapters (The "Brain") ---
container.bind<IVideoDiagnosticAI>(TYPES.VideoAI).toDynamicValue(() => {
    return new GeminiProAdapter(process.env.GCLOUD_PROJECT!);
}).inSingletonScope();

container.bind<IChatAssistantAI>(TYPES.ChatAI).toDynamicValue(() => {
    return new GeminiFlashAdapter(process.env.GCLOUD_PROJECT!);
}).inSingletonScope();

// --- 3. Bind Services (Application) ---
import { VehicleService } from "@/application/services/VehicleService";

container.bind<VehicleService>(TYPES.VehicleService)
    .to(VehicleService)
    .inSingletonScope();

import { DiagnosticService } from "@/application/services/DiagnosticService";

container.bind<DiagnosticService>(TYPES.DiagnosticService)
    .to(DiagnosticService)
    .inSingletonScope();

import { StorageService } from "@/infrastructure/storage/StorageService";

container.bind<StorageService>(TYPES.StorageService).toDynamicValue(() => {
    return new StorageService(process.env.GCLOUD_PROJECT!, process.env.GCLOUD_MEDIA_BUCKET!);
}).inSingletonScope();

export { container };
