import { DiagnosticSession, AIAnalysis } from '../types/models';

export interface ISessionRepository {
    create(session: DiagnosticSession): Promise<void>;
    updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void>;
    addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void>;
    getHistory(sessionId: string): Promise<DiagnosticSession | null>;
    updateStatus(sessionId: string, status: DiagnosticSession['status']): Promise<void>;
    flagSafetyStop(sessionId: string, reason: string): Promise<void>;
    findById(id: string): Promise<DiagnosticSession | null>;
    updateVideo(sessionId: string, videoUrl: string): Promise<void>;
    findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]>;
}
