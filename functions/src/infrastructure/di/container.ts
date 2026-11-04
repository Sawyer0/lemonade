import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types';
import {
    ISessionRepository,
    IVehicleRepository,
    IMultimodalUploadAnalyzer,
    ISafetyAI,
    INHTSAService,
    IVectorRepository,
    ISafetyMonitor,
    ILogger,
} from '@lemonade/core';
import {
    VertexAIVideoAdapter,
    VertexAISafetyAdapter,
    GeminiCoreAdapter,
    Logger,
    EnvConfigProvider,
    TracingService,
    FirestoreSessionRepository,
    FirestoreVehicleRepository,
    NHTSAService,
    VectorRepository,
    SafetyMonitor,
    TYPES as INFRA_TYPES,
} from '@lemonade/infrastructure';

import { VideoAnalysisService } from '../../application/services/VideoAnalysisService';

const container = new Container();

// Shared infrastructure
container.bind(INFRA_TYPES.ConfigProvider).to(EnvConfigProvider).inSingletonScope();
container.bind(INFRA_TYPES.TracingService).to(TracingService).inSingletonScope();
container.bind<GeminiCoreAdapter>(INFRA_TYPES.GeminiCoreAdapter).to(GeminiCoreAdapter).inSingletonScope();
// Logger resolves the optional RemoteLogTransport binding itself.
container.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo).to(FirestoreSessionRepository).inSingletonScope();
container.bind<IVehicleRepository>(TYPES.VehicleRepo).to(FirestoreVehicleRepository).inSingletonScope();
container.bind<IMultimodalUploadAnalyzer>(TYPES.VideoAI).to(VertexAIVideoAdapter).inSingletonScope();
container.bind<ISafetyAI>(TYPES.SafetyAI).to(VertexAISafetyAdapter).inSingletonScope();
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();
container.bind<IVectorRepository>(TYPES.VectorRepo).to(VectorRepository).inSingletonScope();
container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

container.bind<VideoAnalysisService>(TYPES.VideoService).to(VideoAnalysisService).inSingletonScope();

export { container };
