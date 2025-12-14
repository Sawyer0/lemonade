import { injectable, inject } from 'inversify';
import { adminDb } from '@/infrastructure/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
    ISessionRepository,
    DiagnosticSession,
    AIAnalysis,
    DiagnosticSessionSchema,
    AIAnalysisSchema,
    AppError,
    ErrorCode,
    ILogger
} from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';
import { convertTimestamps } from '@/infrastructure/firestore/timestamps';

@injectable()
export class SessionAdminRepository implements ISessionRepository {
    constructor(@inject(TYPES.Logger) private logger: ILogger) { }

    async create(session: DiagnosticSession): Promise<void> {
        try {
            // Validate before write
            DiagnosticSessionSchema.parse(session);
            // admin SDK handles Date objects correctly
            await adminDb.collection('sessions').doc(session.id).set(session);
        } catch (error) {
            this.logger.error('Session creation failed validation or write', error, { sessionId: session.id });
            throw error;
        }
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        const snap = await adminDb.collection('sessions').doc(id).get();
        if (!snap.exists) return null;

        const data = convertTimestamps(snap.data());

        // Data Integrity Fallback: Ensure userId exists for older sessions
        if (!data.userId) {
            data.userId = 'unknown';
        }

        const result = DiagnosticSessionSchema.safeParse(data);

        if (!result.success) {
            this.logger.error(`Session validation failed for ${id}`, result.error);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, `Session data validation failed for ${id}: ${result.error.message}`);
        }

        return result.data;
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        try {
            // Validate analysis object
            AIAnalysisSchema.parse(analysis);

            await adminDb.collection('sessions').doc(sessionId).update({
                aiAnalysis: analysis,
                status: 'waiting_user',
                updatedAt: new Date()
            });
        } catch (error) {
            this.logger.error('Failed to update analysis', error, { sessionId });
            throw error;
        }
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            messages: FieldValue.arrayUnion({
                role,
                // Sanitize content to remove undefined values which Firestore rejects
                content: JSON.parse(JSON.stringify(content)),
                timestamp: new Date()
            }),
            updatedAt: new Date()
        });
    }

    async getHistory(sessionId: string): Promise<DiagnosticSession | null> {
        return this.findById(sessionId);
    }

    async updateStatus(sessionId: string, status: DiagnosticSession['status']): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({ status });
    }

    async delete(sessionId: string): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).delete();
    }

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            safety_stop: true,
            safety_reason: reason,
            updatedAt: new Date()
        });
    }

    async updateVideo(sessionId: string, videoUrl: string): Promise<void> {
        if (!videoUrl || typeof videoUrl !== 'string') {
            throw new AppError(ErrorCode.INVALID_INPUT, 'Invalid video URL');
        }
        await adminDb.collection('sessions').doc(sessionId).update({ videoUrl });
    }

    async findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]> {
        if (!vehicleId) {
            this.logger.warn('SessionAdminRepository.findByVehicleId called with empty vehicleId');
            return [];
        }
        const snapshot = await adminDb.collection('sessions')
            .where('vehicleId', '==', vehicleId)
            .orderBy('startedAt', 'desc')
            .get();

        return snapshot.docs
            .map(doc => {
                const data = convertTimestamps(doc.data());

                // Data Integrity Fallback
                if (!data.userId) {
                    data.userId = 'unknown';
                }

                const result = DiagnosticSessionSchema.safeParse(data);
                if (!result.success) {
                    this.logger.error(`Session validation failed for ${doc.id}`, result.error);
                    return null;
                }
                return result.data;
            })
            .filter((s): s is DiagnosticSession => s !== null);
    }

    async findByUserId(userId: string): Promise<DiagnosticSession[]> {
        if (!userId) {
            this.logger.warn('SessionAdminRepository.findByUserId called with empty userId');
            return [];
        }
        const snapshot = await adminDb.collection('sessions')
            .where('userId', '==', userId)
            .orderBy('startedAt', 'desc')
            .get();

        return snapshot.docs
            .map(doc => {
                const data = convertTimestamps(doc.data());
                const result = DiagnosticSessionSchema.safeParse(data);
                if (!result.success) {
                    this.logger.error(`Session validation failed for ${doc.id}`, result.error);
                    return null;
                }
                return result.data;
            })
            .filter((s): s is DiagnosticSession => s !== null);
    }

    async updateComplaint(sessionId: string, complaint: string): Promise<void> {
        if (!complaint || typeof complaint !== 'string') {
            throw new AppError(ErrorCode.INVALID_INPUT, 'Complaint cannot be empty');
        }
        await adminDb.collection('sessions').doc(sessionId).update({
            complaint: complaint,
            updatedAt: new Date()
        });
    }

    async updateCumulativeVideoDuration(sessionId: string, minutes: number): Promise<void> {
        const session = await this.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const newCumulativeDuration = (session.cumulativeVideoDurationProcessedMinutes || 0) + minutes;

        await adminDb.collection('sessions').doc(sessionId).update({
            cumulativeVideoDurationProcessedMinutes: newCumulativeDuration,
            updatedAt: new Date()
        });
    }

    async updateLastProcessedFrameTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
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

        await adminDb.collection('sessions').doc(sessionId).update({
            cumulativeAudioDurationProcessedMinutes: newCumulativeDuration,
            updatedAt: new Date()
        });
    }

    async updateLastProcessedAudioChunkTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            lastProcessedAudioChunkTimestamp: timestamp,
            updatedAt: new Date()
        });
    }
}