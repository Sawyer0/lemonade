export const TYPES = {
    Logger: Symbol.for('Logger'),
    RemoteLogTransport: Symbol.for('RemoteLogTransport'),
    AuthService: Symbol.for('AuthService'),
    ServerAuthService: Symbol.for('ServerAuthService'),

    // Repositories
    VehicleRepo: Symbol.for('VehicleRepo'),
    SessionRepo: Symbol.for('SessionRepo'),
    UserRepo: Symbol.for('UserRepo'),
    BillingRepository: Symbol.for('BillingRepository'),
    VectorRepository: Symbol.for('VectorRepository'),

    // External Providers
    VehicleInfoProvider: Symbol.for('VehicleInfoProvider'),

    // AI
    MultimodalUploadAI: Symbol.for('MultimodalUploadAI'),
    LiveStreamAI: Symbol.for('LiveStreamAI'),
    ChatAI: Symbol.for('ChatAI'),
    SafetyAI: Symbol.for('SafetyAI'),
    MediaAnalysisModel: Symbol.for('MediaAnalysisModel'),
    FunctionCallService: Symbol.for('FunctionCallService'),

    // Application Services
    VehicleService: Symbol.for('VehicleService'),
    BillingService: Symbol.for('BillingService'),
    SessionService: Symbol.for('SessionService'),
    ChatService: Symbol.for('ChatService'),
    VideoAnalysisService: Symbol.for('VideoAnalysisService'),
    SummarizationService: Symbol.for('SummarizationService'),

    StorageService: Symbol.for('StorageService'),
    SafetyMonitor: Symbol.for('SafetyMonitor'),
    ContextCacheService: Symbol.for('ContextCacheService'),
    NHTSAService: Symbol.for('NHTSAService'),
    GoogleSearchService: Symbol.for('GoogleSearchService'),
    SupermemoryService: Symbol.for('SupermemoryService'),
    ReactiveSafetyService: Symbol.for('ReactiveSafetyService'),
    EmbeddingService: Symbol.for('EmbeddingService'),
    MechanicReasoningService: Symbol.for('MechanicReasoningService'),
    ComplaintIdentificationService: Symbol.for('ComplaintIdentificationService'),
    GeminiCoreAdapter: Symbol.for('GeminiCoreAdapter'),
    ConfigProvider: Symbol.for('ConfigProvider'),
    TracingService: Symbol.for('TracingService'),
    EvalRunner: Symbol.for('EvalRunner'),
    EdgeSecurityService: Symbol.for('EdgeSecurityService'),
    RateLimiter: Symbol.for('RateLimiter'),
};
