import { injectable } from 'inversify';
import { db } from '@/infrastructure/firebase/config';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, query, where, orderBy, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { ISessionRepository, DiagnosticSession, AIAnalysis } from '@lemonade/core';

@injectable()
export class SessionFirestoreRepository implements ISessionRepository {
    async create(session: DiagnosticSession): Promise<void> {
        await setDoc(doc(db, 'sessions', session.id), session);
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        const snap = await getDoc(doc(db, 'sessions', id));
        return snap.exists() ? (snap.data() as DiagnosticSession) : null;
    }

    async findByUserId(userId: string): Promise<DiagnosticSession[]> {
        if (!userId) return [];
        const q = query(
            collection(db, 'sessions'),
            where('userId', '==', userId),
            orderBy('startedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as DiagnosticSession);
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            aiAnalysis: analysis,
            status: 'waiting_user',
            updatedAt: new Date()
        });
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void> {
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

    async delete(sessionId: string): Promise<void> {
        await deleteDoc(doc(db, 'sessions', sessionId));
    }

    async updateStatus(sessionId: string, status: DiagnosticSession['status']): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), { status });
    }

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            safety_stop: true,
            safety_reason: reason
        });
    }

    async updateVideo(sessionId: string, videoUrl: string): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), { videoUrl });
    }

    async findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]> {
        const q = query(
            collection(db, 'sessions'),
            where('vehicleId', '==', vehicleId),
            orderBy('startedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as DiagnosticSession);
    }

    async updateComplaint(sessionId: string, complaint: string): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            complaint: complaint,
            updatedAt: new Date()
        });
    }

    async updateCumulativeVideoDuration(sessionId: string, minutes: number): Promise<void> {
        const session = await this.findById(sessionId);
        if (!session) {
            throw new Error(`Session with ID ${sessionId} not found.`);
        }

        const newCumulativeDuration = (session.cumulativeVideoDurationProcessedMinutes || 0) + minutes;

        await updateDoc(doc(db, 'sessions', sessionId), {
            cumulativeVideoDurationProcessedMinutes: newCumulativeDuration,
            updatedAt: new Date()
        });
    }

    async updateLastProcessedFrameTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            lastProcessedFrameTimestamp: timestamp,
            updatedAt: new Date()
        });
    }

    async updateCumulativeAudioDuration(sessionId: string, minutes: number): Promise<void> {
        const session = await this.findById(sessionId);
        if (!session) {
            throw new Error(`Session with ID ${sessionId} not found.`);
        }

        const newCumulativeDuration = (session.cumulativeAudioDurationProcessedMinutes || 0) + minutes;

        await updateDoc(doc(db, 'sessions', sessionId), {
            cumulativeAudioDurationProcessedMinutes: newCumulativeDuration,
            updatedAt: new Date()
        });
    }

    async updateLastProcessedAudioChunkTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await updateDoc(doc(db, 'sessions', sessionId), {
            lastProcessedAudioChunkTimestamp: timestamp,
            updatedAt: new Date()
        });
    }
}
