export const TYPES = {
    // --- Infrastructure (Tools) ---
    VehicleRepo: Symbol.for('VehicleRepository'),
    SessionRepo: Symbol.for('SessionRepository'),
    VehicleInfoProvider: Symbol.for('VehicleInfoProvider'),
    BillingRepository: Symbol.for('BillingRepository'),

    // --- AI Adapters ---
    VideoAI: Symbol.for('VideoDiagnosticAI'), // Maps to Gemini 2.0 Flash
    ChatAI: Symbol.for('ChatAssistantAI'),    // Maps to Gemini 2.0 Flash
    SafetyAI: Symbol.for('SafetyAI'),

    // --- 4-Layer Grounding (Deep Tech) ---
    NHTSAService: Symbol.for("NHTSAService"),
    EmbeddingService: Symbol.for("EmbeddingService"),
    VectorRepository: Symbol.for("VectorRepository"),
    MechanicReasoningService: Symbol.for("MechanicReasoningService"),
    ServerAuthService: Symbol.for("ServerAuthService"),

    // --- Application Services (Focused) ---
    SessionService: Symbol.for('SessionService'),
    ChatService: Symbol.for('ChatService'),
    VideoAnalysisService: Symbol.for('VideoAnalysisService'),
    VoiceService: Symbol.for('VoiceService'),
    SafetyMonitor: Symbol.for('SafetyMonitor'),
    ContextCacheService: Symbol.for('ContextCacheService'),
    BillingService: Symbol.for('BillingService'),

    // --- Application Services (Legacy/Composite) ---
    /** @deprecated Use focused service symbols instead */
    DiagnosticService: Symbol.for('DiagnosticService'),
    VehicleService: Symbol.for('VehicleService'),
    StorageService: Symbol.for('StorageService'),

    // --- Infrastructure Services ---
    Logger: Symbol.for('Logger'),
    AuthService: Symbol.for('AuthService'),
};