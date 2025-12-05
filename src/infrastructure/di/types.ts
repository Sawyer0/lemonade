export const TYPES = {
    // --- Infrastructure (Tools) ---
    VehicleRepo: Symbol.for('VehicleRepository'),
    SessionRepo: Symbol.for('SessionRepository'),
    VehicleInfoProvider: Symbol.for('VehicleInfoProvider'),

    // --- AI Adapters ---
    VideoAI: Symbol.for('VideoDiagnosticAI'), // Maps to Gemini 2.0 Flash
    ChatAI: Symbol.for('ChatAssistantAI'),    // Maps to Gemini 2.0 Flash

    // --- Application Services (Focused) ---
    SessionService: Symbol.for('SessionService'),
    ChatService: Symbol.for('ChatService'),
    VideoAnalysisService: Symbol.for('VideoAnalysisService'),
    VoiceService: Symbol.for('VoiceService'),
    SafetyMonitor: Symbol.for('SafetyMonitor'),
    ContextCacheService: Symbol.for('ContextCacheService'),

    // --- Application Services (Legacy/Composite) ---
    /** @deprecated Use focused service symbols instead */
    DiagnosticService: Symbol.for('DiagnosticService'),
    VehicleService: Symbol.for('VehicleService'),
    StorageService: Symbol.for('StorageService'),

    // --- Infrastructure Services ---
    Logger: Symbol.for('Logger'),
    AuthService: Symbol.for('AuthService'),
};
