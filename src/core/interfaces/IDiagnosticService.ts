import { DiagnosticSession } from '../entities/DiagnosticSession';
import { Vehicle } from '../entities/Vehicle';

export interface IDiagnosticService {
    processVideoUpload(sessionId: string, videoUrl: string): Promise<void>;
    handleChatInteraction(sessionId: string, userMessage: string): Promise<string>;
    processVoiceCommand(sessionId: string, audioData: Float32Array): Promise<string>;
    getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }>;
    addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void>;
}
