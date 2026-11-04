import 'reflect-metadata';
import { Container, interfaces } from 'inversify';
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
    Logger,
    EnvConfigProvider,
    TracingService,
    FirestoreSessionRepository,
    TYPES as INFRA_TYPES,
} from '@lemonade/infrastructure';

import { FirestoreVehicleRepository } from '../repositories/FirestoreVehicleRepository';
import { NHTSAService } from '../external/NHTSAService';
import { VectorRepository } from '../repositories/VectorRepository';
import { VideoAnalysisService } from '../../application/services/VideoAnalysisService';
import { SafetyMonitor } from '../../application/services/SafetyMonitor';

// Define RemoteTransport interface if not already defined globally or in common core
interface RemoteTransport {
    send(logEntry: Record<string, unknown>): void;
}

const container = new Container();

// Bind Infrastructure Services
container.bind(INFRA_TYPES.ConfigProvider).to(EnvConfigProvider).inSingletonScope();
container.bind(INFRA_TYPES.TracingService).to(TracingService).inSingletonScope();

// Logger Binding
container
    .bind<ILogger>(TYPES.Logger)
    .toDynamicValue((context: interfaces.Context) => {
        // Resolve RemoteLogTransport if it's bound, otherwise pass undefined
        const remoteTransport = context.container.isBound(TYPES.RemoteLogTransport)
            ? (context.container as Container).get<RemoteTransport>(TYPES.RemoteLogTransport)
            : undefined;
        return new Logger(remoteTransport);
    })
    .inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo).to(FirestoreSessionRepository).inSingletonScope();
container.bind<IVehicleRepository>(TYPES.VehicleRepo).to(FirestoreVehicleRepository).inSingletonScope();
container.bind<IMultimodalUploadAnalyzer>(TYPES.VideoAI).to(VertexAIVideoAdapter).inSingletonScope();
container.bind<ISafetyAI>(TYPES.SafetyAI).to(VertexAISafetyAdapter).inSingletonScope();
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();
container.bind<IVectorRepository>(TYPES.VectorRepo).to(VectorRepository).inSingletonScope();
container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

container.bind<VideoAnalysisService>(TYPES.VideoService).to(VideoAnalysisService).inSingletonScope();

export { container };
