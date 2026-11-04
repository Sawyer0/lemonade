import { TYPES as INFRA_TYPES } from '@lemonade/infrastructure';

/**
 * Cloud Functions bindings. Shared services reuse the infrastructure package's
 * Symbol.for keys so their @inject decorators resolve against this container.
 */
export const TYPES = {
    Logger: INFRA_TYPES.Logger,
    RemoteLogTransport: INFRA_TYPES.RemoteLogTransport,
    SafetyAI: INFRA_TYPES.SafetyAI,
    SafetyMonitor: INFRA_TYPES.SafetyMonitor,
    NHTSAService: INFRA_TYPES.NHTSAService,
    VectorRepo: INFRA_TYPES.VectorRepository,
    VideoAI: Symbol.for('VideoDiagnosticAI'),
    SessionRepo: INFRA_TYPES.SessionRepo,
    VehicleRepo: INFRA_TYPES.VehicleRepo,
    VideoService: Symbol.for('VideoAnalysisService'),
};
