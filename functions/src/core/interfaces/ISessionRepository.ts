import { AIAnalysis } from '../types/models';

export interface ISessionRepository {
    updateStatus(sessionId: string, status: string): Promise<void>;
    updateAnalysis(sessionId: string, analysis: AIAnalysis, videoUrl: string): Promise<void>;
    updateError(sessionId: string, error: Error): Promise<void>;
    updateSafetyAlert(sessionId: string, reason: string): Promise<void>;
    getVehicleId(sessionId: string): Promise<string | null>;
}
