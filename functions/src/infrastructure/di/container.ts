import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types';
import { ISessionRepository } from '../../core/interfaces/ISessionRepository';
import { IVehicleRepository } from '../../core/interfaces/IVehicleRepository';
import { IVideoDiagnosticAI, ISafetyAI } from '../../core/interfaces/IAIService';
import { INHTSAService } from '../../core/interfaces/INHTSAService';
import { IVectorRepository } from '../../core/interfaces/IVectorRepository';
import { ISafetyMonitor } from '../../core/interfaces/ISafetyMonitor';
import { ILogger } from '../../core/interfaces/ILogger'; // Interface

import { FirestoreSessionRepository } from '../repositories/FirestoreSessionRepository';
import { FirestoreVehicleRepository } from '../repositories/FirestoreVehicleRepository';
import { VertexAIVideoAdapter } from '../ai/VertexAIVideoAdapter';
import { VertexAISafetyAdapter } from '../ai/VertexAISafetyAdapter';
import { NHTSAService } from '../external/NHTSAService';
import { VectorRepository } from '../repositories/VectorRepository';
import { VideoAnalysisService } from '../../application/services/VideoAnalysisService';
import { SafetyMonitor } from '../../application/services/SafetyMonitor';
import { Logger } from '../logging/Logger'; // Implementation

const container = new Container();

container.bind<ILogger>(TYPES.Logger).to(Logger).inSingletonScope(); // Bound Logger first

container.bind<ISessionRepository>(TYPES.SessionRepo).to(FirestoreSessionRepository).inSingletonScope();
container.bind<IVehicleRepository>(TYPES.VehicleRepo).to(FirestoreVehicleRepository).inSingletonScope();
container.bind<IVideoDiagnosticAI>(TYPES.VideoAI).to(VertexAIVideoAdapter).inSingletonScope();
container.bind<ISafetyAI>(TYPES.SafetyAI).to(VertexAISafetyAdapter).inSingletonScope();
container.bind<INHTSAService>(TYPES.NHTSAService).to(NHTSAService).inSingletonScope();
container.bind<IVectorRepository>(TYPES.VectorRepo).to(VectorRepository).inSingletonScope();
container.bind<ISafetyMonitor>(TYPES.SafetyMonitor).to(SafetyMonitor).inSingletonScope();

container.bind<VideoAnalysisService>(TYPES.VideoService).to(VideoAnalysisService).inSingletonScope();

export { container };
