export const TYPES = {
    ConfigProvider: Symbol.for('ConfigProvider'),
    Logger: Symbol.for('Logger'),
    TracingService: Symbol.for('TracingService'),
    EvalRunner: Symbol.for('EvalRunner'),
    RemoteLogTransport: Symbol.for('RemoteLogTransport'),

    // Services
    BillingService: Symbol.for('BillingService'),
    GeminiCoreAdapter: Symbol.for('GeminiCoreAdapter'),
    ContextCacheService: Symbol.for('ContextCacheService'),
    FunctionCallService: Symbol.for('FunctionCallService'),
    GoogleSearchService: Symbol.for('GoogleSearchService'),
    SupermemoryService: Symbol.for('SupermemoryService'),
    MultimodalUploadAI: Symbol.for('MultimodalUploadAI'),
    ChatAI: Symbol.for('ChatAI'),
    SafetyAI: Symbol.for('SafetyAI'),
    NHTSAService: Symbol.for('NHTSAService'),
    EmbeddingService: Symbol.for('EmbeddingService'),
    VectorRepository: Symbol.for('VectorRepository'),
    ReactiveSafetyService: Symbol.for('ReactiveSafetyService'),
    SafetyMonitor: Symbol.for('SafetyMonitor'),
    MechanicReasoningService: Symbol.for('MechanicReasoningService'),
    EdgeSecurityService: Symbol.for('EdgeSecurityService'),
    RateLimiter: Symbol.for('RateLimiter'),

    // Repositories
    UserRepo: Symbol.for('UserRepo'),
    SessionRepo: Symbol.for('SessionRepo'),
    VehicleRepo: Symbol.for('VehicleRepo'),
    BillingRepository: Symbol.for('BillingRepository'),
};
