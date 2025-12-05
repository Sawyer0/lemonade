import { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import { DiagnosticSession, AIAnalysis } from '@/core/types/models';

export class MemorySessionRepository implements ISessionRepository {
    private sessions: Map<string, DiagnosticSession> = new Map();

    async create(session: DiagnosticSession): Promise<void> {
        this.sessions.set(session.id, session);
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        return this.sessions.get(id) || null;
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.aiAnalysis = analysis;
            session.status = 'waiting_user';
            session.updatedAt = new Date();
            this.sessions.set(sessionId, session);
        }
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.messages.push({
                role,
                content,
                timestamp: new Date()
            });
            session.updatedAt = new Date();
            this.sessions.set(sessionId, session);
        }
    }

    async getHistory(sessionId: string): Promise<DiagnosticSession | null> {
        return this.findById(sessionId);
    }

    async updateStatus(sessionId: string, status: DiagnosticSession['status']): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = status;
            this.sessions.set(sessionId, session);
        }
    }

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            if (!session.aiAnalysis) {
                // Initialize if null, though usually analysis comes first. 
                // But for safety stop, we might need a placeholder.
                session.aiAnalysis = {
                    diagnosis: `SAFETY STOP: ${reason}`,
                    visual_evidence: [],
                    acoustic_evidence: [],
                    severity: 'critical',
                    suggested_actions: [],
                    safety_alert: true
                };
            } else {
                session.aiAnalysis.safety_alert = true;
                session.aiAnalysis.diagnosis = `SAFETY STOP: ${reason}`;
            }
            this.sessions.set(sessionId, session);
        }
    }

    async updateVideo(sessionId: string, videoUrl: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.videoUrl = videoUrl;
            this.sessions.set(sessionId, session);
        }
    }

    async findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]> {
        return Array.from(this.sessions.values())
            .filter(s => s.vehicleId === vehicleId)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
}
