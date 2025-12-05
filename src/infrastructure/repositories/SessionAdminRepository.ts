import { injectable } from 'inversify';
import { adminDb } from '@/infrastructure/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import { DiagnosticSession, AIAnalysis, DiagnosticSessionSchema } from '@/core/entities/DiagnosticSession';

@injectable()
export class SessionAdminRepository implements ISessionRepository {
    async create(session: DiagnosticSession): Promise<void> {
        // admin SDK handles Date objects correctly
        await adminDb.collection('sessions').doc(session.id).set(session);
    }

    private convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
        if (!data) return data;
        const converted = { ...data };
        if (converted.updatedAt && typeof (converted.updatedAt as Record<string, unknown>).toDate === 'function') {
            converted.updatedAt = ((converted.updatedAt as Record<string, unknown>).toDate as () => Date)();
        }
        if (converted.startedAt && typeof (converted.startedAt as Record<string, unknown>).toDate === 'function') {
            converted.startedAt = ((converted.startedAt as Record<string, unknown>).toDate as () => Date)();
        }
        if (converted.messages && Array.isArray(converted.messages)) {
            converted.messages = converted.messages.map((msg: Record<string, unknown>) => ({
                ...msg,
                timestamp: msg.timestamp && typeof (msg.timestamp as Record<string, unknown>).toDate === 'function'
                    ? ((msg.timestamp as Record<string, unknown>).toDate as () => Date)()
                    : msg.timestamp
            }));
        }
        return converted;
    }

    async findById(id: string): Promise<DiagnosticSession | null> {
        const snap = await adminDb.collection('sessions').doc(id).get();
        if (!snap.exists) return null;

        const data = this.convertTimestamps(snap.data());
        const result = DiagnosticSessionSchema.safeParse(data);

        if (!result.success) {
            console.error(`Session validation failed for ${id}:`, result.error);
            throw new Error(`Session data validation failed for ${id}: ${result.error.message}`);
        }

        return result.data;
    }

    async updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            aiAnalysis: analysis,
            status: 'waiting_user',
            updatedAt: new Date()
        });
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({
            messages: FieldValue.arrayUnion({
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
        await adminDb.collection('sessions').doc(sessionId).update({ status });
    }

    async flagSafetyStop(sessionId: string, reason: string): Promise<void> {
        const ref = adminDb.collection('sessions').doc(sessionId);

        await adminDb.runTransaction(async (t) => {
            const doc = await t.get(ref);
            if (!doc.exists) return;

            const validationResult = DiagnosticSessionSchema.safeParse(doc.data());
            if (!validationResult.success) {
                console.error(`Session validation failed for ${sessionId}:`, validationResult.error);
                throw new Error(`Cannot flag safety stop: session data is invalid`);
            }

            const data = validationResult.data;
            const currentAnalysis = data.aiAnalysis || {
                diagnosis: 'Safety Stop Triggered',
                visual_evidence: [],
                acoustic_evidence: [],
                severity: 'critical',
                suggested_actions: [],
                safety_alert: false
            };

            const updatedAnalysis: AIAnalysis = {
                ...currentAnalysis,
                safety_alert: true,
                // We do NOT overwrite diagnosis here, preserving it.
                // But we might want to ensure the reason is captured.
                suggested_actions: [`SAFETY STOP: ${reason}`, ...currentAnalysis.suggested_actions]
            };
            t.update(ref, {
                aiAnalysis: updatedAnalysis,
                updatedAt: new Date()
            });
        });
    }

    async updateVideo(sessionId: string, videoUrl: string): Promise<void> {
        await adminDb.collection('sessions').doc(sessionId).update({ videoUrl });
    }

    async findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]> {
        if (!vehicleId) {
            console.warn('SessionAdminRepository.findByVehicleId called with empty vehicleId');
            return [];
        }
        const snapshot = await adminDb.collection('sessions')
            .where('vehicleId', '==', vehicleId)
            .orderBy('startedAt', 'desc')
            .get();

        return snapshot.docs
            .map(doc => {
                const data = this.convertTimestamps(doc.data());
                const result = DiagnosticSessionSchema.safeParse(data);
                if (!result.success) {
                    console.error(`Session validation failed for ${doc.id}:`, result.error);
                    return null;
                }
                return result.data;
            })
            .filter((s): s is DiagnosticSession => s !== null);
    }
}
