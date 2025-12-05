export const TYPES = {
    // --- Infrastructure (Tools) ---
    VehicleRepo: Symbol.for('VehicleRepository'),
    SessionRepo: Symbol.for('SessionRepository'),
    VehicleInfoProvider: Symbol.for('VehicleInfoProvider'),

    // --- AI Adapters ---
    VideoAI: Symbol.for('VideoDiagnosticAI'), // Maps to Gemini 2.0 Flash
    ChatAI: Symbol.for('ChatAssistantAI'),    // Maps to Gemini 2.0 Flash

    // --- Application (Logic) ---
    DiagnosticService: Symbol.for('DiagnosticService'),
    VehicleService: Symbol.for('VehicleService'),
    StorageService: Symbol.for('StorageService'),
    Logger: Symbol.for('Logger'),
};
