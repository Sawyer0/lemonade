import { injectable } from 'inversify';
import { db } from '@/infrastructure/firebase/config';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import { DiagnosticSession, AIAnalysis } from '@/core/types/models';

@injectable()
export class SessionFirestoreRepository implements ISessionRepository {
    async create(session: DiagnosticSession): Promise<void> {
        await setDoc(doc(db, 'sessions', session.id), session);
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        const snap = await getDoc(doc(db, 'sessions', id));
        return snap.exists() ? (snap.data() as DiagnosticSession) : null;
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            aiAnalysis: analysis,
            status: 'waiting_user',
            updatedAt: new Date()
        });
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            messages: arrayUnion({
                role,
                content,
                timestamp: new Date()
            }),
            updatedAt: new Date()
        });
    }

    async getHistory(sessionId: string): Promise<DiagnosticSession | null> {
        return this.findById(sessionId);
    }

    async updateStatus(sessionId: string, status: DiagnosticSession['status']): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), { status });
    }

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            'aiAnalysis.safety_alert': true,
            'aiAnalysis.diagnosis': `SAFETY STOP: ${reason}`
        });
    }
}
