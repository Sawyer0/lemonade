import { injectable, inject } from 'inversify';
import { adminDb } from '../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { ILogger } from '@lemonade/core';
import {
    ISessionRepository,
    DiagnosticSession,
    AIAnalysis,
    DiagnosticSessionSchema,
    AIAnalysisSchema,
    AppError,
    ErrorCode,
    convertTimestamps,
} from '@lemonade/core';
import { TYPES } from '../di/types';

@injectable()
export class FirestoreSessionRepository implements ISessionRepository {
    constructor(@inject(TYPES.Logger) private logger: ILogger) {}

    async create(session: DiagnosticSession): Promise<void> {
        try {
            DiagnosticSessionSchema.parse(session);
            await adminDb.collection('sessions').doc(session.id).set(session);
        } catch (error) {
            this.logger.error('Session creation failed validation or write', error as Error, { sessionId: session.id });
            throw error;
        }
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        const snap = await adminDb.collection('sessions').doc(id).get();
        if (!snap.exists) return null;

        const data = convertTimestamps(snap.data() ?? {});

        if (!data.userId) {
            data.userId = 'unknown';
        }

        const result = DiagnosticSessionSchema.safeParse(data);

        if (!result.success) {
            this.logger.error(`Session validation failed for ${id}`, result.error);
            throw new AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                `Session data validation failed for ${id}: ${result.error.message}`,
            );
        }

        return result.data;
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        try {
            AIAnalysisSchema.parse(analysis);

            await adminDb.collection('sessions').doc(sessionId).update({
                aiAnalysis: analysis,
                status: 'waiting_user',
                updatedAt: new Date(),
            });
        } catch (error) {
            this.logger.error('Failed to update analysis', error as Error, { sessionId });
            throw error;
        }
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void> {
        await adminDb
            .collection('sessions')
            .doc(sessionId)
            .update({
                messages: FieldValue.arrayUnion({
                    role,
                    content: JSON.parse(JSON.stringify(content)),
                    timestamp: new Date(),
                }),
                updatedAt: new Date(),
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
            updatedAt: new Date(),
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
        const snapshot = await adminDb
            .collection('sessions')
            .where('vehicleId', '==', vehicleId)
            .orderBy('startedAt', 'desc')
            .get();

        return snapshot.docs
            .map((doc) => {
                const data = convertTimestamps(doc.data());

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
        const snapshot = await adminDb
            .collection('sessions')
            .where('userId', '==', userId)
            .orderBy('startedAt', 'desc')
            .get();

        return snapshot.docs
            .map((doc) => {
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
            updatedAt: new Date(),
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
            updatedAt: new Date(),
        });
    }

    async updateLastProcessedFrameTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            lastProcessedFrameTimestamp: timestamp,
            updatedAt: new Date(),
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
            updatedAt: new Date(),
        });
    }

    async updateLastProcessedAudioChunkTimestamp(sessionId: string, timestamp: number): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            lastProcessedAudioChunkTimestamp: timestamp,
            updatedAt: new Date(),
        });
    }

    // ========================================
    // Phase 3: XState Persistence Methods
    // ========================================

    /**
     * Save XState machine snapshot to enable session recovery after app crash/restart.
     * Called after each state transition in MechanicReasoningService.
     */
    async saveXStateSnapshot(sessionId: string, snapshot: unknown): Promise<void> {
        try {
            await adminDb
                .collection('sessions')
                .doc(sessionId)
                .update({
                    xstateSnapshot: JSON.parse(JSON.stringify(snapshot)), // Ensure serializable
                    updatedAt: new Date(),
                });
            this.logger.debug('XState snapshot saved', { sessionId });
        } catch (error) {
            this.logger.error('Failed to save XState snapshot', error as Error, { sessionId });
            // Don't throw - snapshot save failure shouldn't break the session
        }
    }

    /**
     * Retrieve XState machine snapshot for session recovery.
     * Returns null if no snapshot exists (new session or snapshot was cleared).
     */
    async getXStateSnapshot(sessionId: string): Promise<unknown | null> {
        try {
            const snap = await adminDb.collection('sessions').doc(sessionId).get();
            if (!snap.exists) return null;

            const data = snap.data();
            return data?.xstateSnapshot ?? null;
        } catch (error) {
            this.logger.error('Failed to get XState snapshot', error as Error, { sessionId });
            return null;
        }
    }

    /**
     * Clear XState snapshot after session completion.
     * Called when session status changes to 'completed'.
     */
    async clearXStateSnapshot(sessionId: string): Promise<void> {
        try {
            await adminDb.collection('sessions').doc(sessionId).update({
                xstateSnapshot: FieldValue.delete(),
                updatedAt: new Date(),
            });
            this.logger.debug('XState snapshot cleared', { sessionId });
        } catch (error) {
            this.logger.error('Failed to clear XState snapshot', error as Error, { sessionId });
        }
    }
}
