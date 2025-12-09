import { injectable } from 'inversify';
import { ISessionRepository } from '../../core/interfaces/ISessionRepository';
import { AIAnalysis } from '../../core/types/models';
import { getFirestore } from 'firebase-admin/firestore';

@injectable()
export class FirestoreSessionRepository implements ISessionRepository {
    private db = getFirestore();

    async updateStatus(sessionId: string, status: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({ status });
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis, videoUrl: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            status: 'completed',
            ai_analysis: analysis,
            videoUrl: videoUrl,
            updatedAt: new Date(),
        });
    }

    async updateError(sessionId: string, error: Error): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            status: 'error',
            error_message: error.message,
            updatedAt: new Date(),
        });
    }

    async updateSafetyAlert(sessionId: string, reason: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            safety_stop: true,
            safety_reason: reason,
        });
    }

    async getVehicleId(sessionId: string): Promise<string | null> {
        const doc = await this.db.collection('sessions').doc(sessionId).get();
        return doc.exists ? doc.data()?.vehicleId || null : null;
    }
}
