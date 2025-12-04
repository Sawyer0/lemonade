export interface IDiagnosticService {
    processVideoUpload(sessionId: string, videoUrl: string): Promise<void>;
    handleChatInteraction(sessionId: string, userMessage: string): Promise<string>;
    processVoiceCommand(sessionId: string, audioData: Float32Array): Promise<string>;
}
