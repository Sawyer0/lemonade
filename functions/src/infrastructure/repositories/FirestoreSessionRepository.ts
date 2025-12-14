import { injectable } from 'inversify';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {     ISessionRepository,
    AIAnalysis,
    DiagnosticSession,
    DiagnosticSessionSchema,
    AppError,
    ErrorCode
} from '@lemonade/core';
import { convertTimestamps } from './timestamps'; // Added

@injectable()
export class FirestoreSessionRepository implements ISessionRepository {
    private db = getFirestore();

    async findById(id: string): Promise<DiagnosticSession | null> {
        const snap = await this.db.collection('sessions').doc(id).get();
        if (!snap.exists) return null;

        const data = convertTimestamps(snap.data());

        const result = DiagnosticSessionSchema.safeParse(data);

        if (!result.success) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, `Session data validation failed for ${id}: ${result.error.message}`);
        }

        return result.data;
    }

    async updateStatus(sessionId: string, status: DiagnosticSession["status"]): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({ status });
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            status: 'completed',
            aiAnalysis: analysis,
            updatedAt: new Date(),
        });
    }

    async updateVideo(sessionId: string, videoUrl: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
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

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            safety_stop: true,
            safety_reason: reason,
        });
    }

    // Missing Methods Implementation
    async create(session: DiagnosticSession): Promise<void> {
        await this.db.collection('sessions').doc(session.id).set(session);
    }

    async addMessage(sessionId: string, role: "user" | "assistant" | "system", content: unknown): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            messages: FieldValue.arrayUnion({
                role,
                content,
                timestamp: new Date()
            })
        });
    }

    async getHistory(sessionId: string): Promise<DiagnosticSession | null> {
        return this.findById(sessionId);
    }

    async delete(sessionId: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).delete();
    }

    async findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]> {
        const snapshot = await this.db.collection('sessions').where('vehicleId', '==', vehicleId).get();
        return snapshot.docs.map(d => {
            const data = convertTimestamps(d.data());
            const result = DiagnosticSessionSchema.safeParse(data);
            if (!result.success) {
                console.error(`Session data validation failed for doc ${d.id} for vehicle ${vehicleId}`, result.error);
                return null;
            }
            return result.data;
        }).filter((s): s is DiagnosticSession => s !== null);
    }

    async findByUserId(userId: string): Promise<DiagnosticSession[]> {
        const snapshot = await this.db.collection('sessions').where('userId', '==', userId).get();
        return snapshot.docs.map(d => {
            const data = convertTimestamps(d.data());
            const result = DiagnosticSessionSchema.safeParse(data);
            if (!result.success) {
                console.error(`Session data validation failed for doc ${d.id} for user ${userId}`, result.error);
                return null;
            }
            return result.data;
        }).filter((s): s is DiagnosticSession => s !== null);
    }


    async getVehicleId(sessionId: string): Promise<string | null> {
        const doc = await this.db.collection('sessions').doc(sessionId).get();
        return doc.exists ? doc.data()?.vehicleId || null : null;
    }

    async updateComplaint(sessionId: string, complaint: string): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            complaint: complaint,
            updatedAt: new Date()
        });
    }

    async updateCumulativeVideoDuration(sessionId: string, minutes: number): Promise<void> {
        const session = await this.findById(sessionId);
        if (!session) {
            // Or throw an AppError, depending on desired behavior
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const newCumulativeDuration = (session.cumulativeVideoDurationProcessedMinutes || 0) + minutes;

        await this.db.collection('sessions').doc(sessionId).update({
            cumulativeVideoDurationProcessedMinutes: newCumulativeDuration,
            updatedAt: new Date()
        });
    }

    async updateLastProcessedFrameTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            lastProcessedFrameTimestamp: timestamp,
            updatedAt: new Date()
        });
    }

    async updateCumulativeAudioDuration(sessionId: string, minutes: number): Promise<void> {
        const session = await this.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const newCumulativeDuration = (session.cumulativeAudioDurationProcessedMinutes || 0) + minutes;

        await this.db.collection('sessions').doc(sessionId).update({
            cumulativeAudioDurationProcessedMinutes: newCumulativeDuration,
            updatedAt: new Date()
        });
    }

    async updateLastProcessedAudioChunkTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await this.db.collection('sessions').doc(sessionId).update({
            lastProcessedAudioChunkTimestamp: timestamp,
            updatedAt: new Date()
        });
    }
}
