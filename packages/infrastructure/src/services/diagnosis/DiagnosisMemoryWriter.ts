import type {
    IEmbeddingService,
    ILogger,
    IMemoryService,
    ISessionRepository,
    IVectorRepository,
    NeurosymbolicState,
} from '@lemonade/core';
import { MemoryTags } from '@lemonade/core';

function formatDiagnosticLog(text: string, state: NeurosymbolicState): string {
    return `
[DIAGNOSTIC LOG]
Date: ${new Date().toISOString()}
User Query: ${text}
Vehicle VIN: ${state.authorityData.vin || 'Unknown'}
Final Diagnosis: ${state.finalDiagnosis.userOutput}
Reasoning Trace: ${state.finalDiagnosis.reasoningTrace}
Required Actions: ${state.finalDiagnosis.requiredActions.join(', ')}
Meta Confidence: ${state.finalDiagnosis.metaConfidence}
        `.trim();
}

/**
 * Persists a confident diagnosis: an embedding in the collective vector store,
 * a diagnostic log in long-term memory scoped to the user and vehicle, and, for
 * verified cases, the session's video and images as observations.
 */
export class DiagnosisMemoryWriter {
    constructor(
        private readonly embeddingService: IEmbeddingService,
        private readonly vectorRepo: IVectorRepository,
        private readonly memoryService: IMemoryService,
        private readonly sessionRepo: ISessionRepository,
        private readonly logger: ILogger,
    ) {}

    async save(text: string, state: NeurosymbolicState, userId: string, sessionId: string): Promise<void> {
        const vector = await this.embeddingService.embed(text);

        await this.vectorRepo.addCase(text, vector, {
            userId: userId,
            diagnosis: state.finalDiagnosis.userOutput,
            vehicle: state.authorityData.vin || 'unknown',
            timestamp: new Date().toISOString(),
        });

        const isolationTags = MemoryTags.forVehicle(userId, state.authorityData.vin || 'unknown');

        try {
            await this.memoryService.addDocument({
                content: formatDiagnosticLog(text, state),
                tags: [
                    MemoryTags.type('diagnostic'),
                    ...isolationTags,
                    ...(state.verification.isVerified
                        ? [MemoryTags.status('verified')]
                        : [MemoryTags.status('session')]),
                ],
                metadata: {
                    sessionId,
                    isVerified: state.verification.isVerified,
                },
            });

            if (state.verification.isVerified) {
                await this.saveSessionArtifacts(sessionId, isolationTags);
            }

            this.logger.info('Diagnostic session saved to Supermemory', { vin: state.authorityData.vin, sessionId });
        } catch (error) {
            this.logger.error('Failed to save to Supermemory', error as Error);
        }
    }

    private async saveSessionArtifacts(sessionId: string, isolationTags: string[]): Promise<void> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) return;

        const observationTags = [MemoryTags.type('observation'), ...isolationTags, MemoryTags.status('verified')];

        if (session.videoUrl) {
            await this.memoryService
                .addDocument({
                    url: session.videoUrl,
                    tags: observationTags,
                    metadata: { sessionId, artifactType: 'video' },
                })
                .catch((e) => this.logger.warn('Failed to ingest session video', { error: e }));
        }

        const imageUrls = new Set<string>();
        session.messages.forEach((msg) => {
            if (Array.isArray(msg.content)) {
                msg.content.forEach((part) => {
                    if (part.type === 'image' && part.image) imageUrls.add(part.image);
                });
            }
        });

        for (const url of imageUrls) {
            await this.memoryService
                .addDocument({
                    url,
                    tags: observationTags,
                    metadata: { sessionId, artifactType: 'image' },
                })
                .catch((e) => this.logger.warn('Failed to ingest session image', { error: e, url }));
        }
    }
}
