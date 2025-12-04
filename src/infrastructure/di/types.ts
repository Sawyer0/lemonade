export const TYPES = {
    // --- Infrastructure (Tools) ---
    VehicleRepo: Symbol.for('VehicleRepository'),
    SessionRepo: Symbol.for('SessionRepository'),

    // --- AI Adapters ---
    VideoAI: Symbol.for('VideoDiagnosticAI'), // Maps to Gemini 3 Pro
    ChatAI: Symbol.for('ChatAssistantAI'),    // Maps to Gemini Flash

    // --- Application (Logic) ---
    DiagnosticService: Symbol.for('DiagnosticService'),
    VehicleService: Symbol.for('VehicleService'),
    StorageService: Symbol.for('StorageService'),
    Logger: Symbol.for('Logger'),
};
