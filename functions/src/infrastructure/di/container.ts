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
    ILogger 
} from '@lemonade/core';

import { FirestoreSessionRepository } from '../repositories/FirestoreSessionRepository';
import { FirestoreVehicleRepository } from '../repositories/FirestoreVehicleRepository';
import { VertexAIVideoAdapter } from '../ai/VertexAIVideoAdapter';
import { VertexAISafetyAdapter } from '../ai/VertexAISafetyAdapter';
import { NHTSAService } from '../external/NHTSAService';
import { VectorRepository } from '../repositories/VectorRepository';
import { VideoAnalysisService } from '../../application/services/VideoAnalysisService';
import { SafetyMonitor } from '../../application/services/SafetyMonitor';
import { Logger } from '../logging/Logger'; // Implementation

// Define RemoteTransport interface if not already defined globally or in common core
interface RemoteTransport {
    send(logEntry: Record<string, unknown>): void;
}

const container = new Container();

// --- BIND CUSTOM REMOTE TRANSPORT HERE (e.g., Google Cloud Logging client) ---
// For now, it's just an optional parameter, so we bind a dummy or leave it unbound
// If you uncomment this, you'd provide an actual implementation:
// container.bind<RemoteTransport>(TYPES.RemoteLogTransport).to(GoogleCloudLoggingTransport).inSingletonScope();

container.bind<ILogger>(TYPES.Logger).toDynamicValue((context: any) => {
    // Resolve RemoteLogTransport if it's bound, otherwise pass undefined
    const remoteTransport = context.container.isBound(TYPES.RemoteLogTransport)
        ? (context.container as Container).get<RemoteTransport>(TYPES.RemoteLogTransport)
        : undefined;
    return new Logger(remoteTransport);
}).inSingletonScope();

container.bind<ISessionRepository>(TYPES.SessionRepo).to(FirestoreSessionRepository).inSingletonScope();
container.bind<IVehicleRepository>(TYPES.VehicleRepo).to(FirestoreVehicleRepository).inSingletonScope();
container.bind<IMultimodalUploadAnalyzer>(TYPES.VideoAI).to(VertexAIVideoAdapter).inSingletonScope();
container.bind<ISafetyAI>(TYPES.SafetyAI).to(VertexAISafetyAdapter).inSingletonScope();
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();
container.bind<IVectorRepository>(TYPES.VectorRepo).to(VectorRepository).inSingletonScope();
container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

container.bind<VideoAnalysisService>(TYPES.VideoService).to(VideoAnalysisService).inSingletonScope();

export { container };