import { ISessionRepository, DiagnosticSession, AIAnalysis, MessagePart } from '@lemonade/core';

export class MemorySessionRepository implements ISessionRepository {
    private sessions: Map<string, DiagnosticSession> = new Map();

    async create(session: DiagnosticSession): Promise<void> {
        this.sessions.set(session.id, session);
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        return this.sessions.get(id) || null;
    }

    async findByUserId(userId: string): Promise<DiagnosticSession[]> {
        return Array.from(this.sessions.values()).filter(s => s.userId === userId);
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.aiAnalysis = analysis;
            session.status = 'waiting_user';
            session.updatedAt = new Date();
        }
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string | MessagePart[]): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.messages.push({ role, content, timestamp: new Date() });
            session.updatedAt = new Date();
        }
    }

    async getHistory(sessionId: string): Promise<DiagnosticSession | null> {
        return this.findById(sessionId);
    }

    async delete(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
    }

    async updateStatus(sessionId: string, status: DiagnosticSession['status']): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = status;
        }
    }

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.safety_stop = true;
        }
    }

    async updateVideo(sessionId: string, videoUrl: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.videoUrl = videoUrl;
        }
    }

    async findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]> {
        return Array.from(this.sessions.values()).filter(s => s.vehicleId === vehicleId);
    }

    async updateComplaint(sessionId: string, complaint: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.complaint = complaint;
            session.updatedAt = new Date();
        }
    }

    async updateCumulativeVideoDuration(sessionId: string, minutes: number): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.cumulativeVideoDurationProcessedMinutes = (session.cumulativeVideoDurationProcessedMinutes || 0) + minutes;
            session.updatedAt = new Date();
        }
    }

    async updateLastProcessedFrameTimestamp(sessionId: string, timestamp: number): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastProcessedFrameTimestamp = timestamp;
            session.updatedAt = new Date();
        }
    }

    async updateCumulativeAudioDuration(sessionId: string, minutes: number): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.cumulativeAudioDurationProcessedMinutes = (session.cumulativeAudioDurationProcessedMinutes || 0) + minutes;
            session.updatedAt = new Date();
        }
    }

    async updateLastProcessedAudioChunkTimestamp(sessionId: string, timestamp: number): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastProcessedAudioChunkTimestamp = timestamp;
            session.updatedAt = new Date();
        }
    }
}