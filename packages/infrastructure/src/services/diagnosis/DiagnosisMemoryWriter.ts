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
 *
 * This writer persists diagnostic logs, never vehicle facts. A vehicle fact is
 * created only by the core write policy (LM-31) from ledger events. When the
 * caller passes a shop scope, the log is tagged to the shop that holds the
 * vehicle record instead of the user, and the metadata records which ledger
 * events the diagnosis is grounded in.
 */
export interface DiagnosisMemoryScope {
    shopId: string;
    ledgerEventIds?: string[];
}

export class DiagnosisMemoryWriter {
    constructor(
        private readonly embeddingService: IEmbeddingService,
        private readonly vectorRepo: IVectorRepository,
        private readonly memoryService: IMemoryService,
        private readonly sessionRepo: ISessionRepository,
        private readonly logger: ILogger,
    ) {}

    async save(
        text: string,
        state: NeurosymbolicState,
        userId: string,
        sessionId: string,
        scope?: DiagnosisMemoryScope,
    ): Promise<void> {
        const vector = await this.embeddingService.embed(text);

        await this.vectorRepo.addCase(text, vector, {
            userId: userId,
            diagnosis: state.finalDiagnosis.userOutput,
            vehicle: state.authorityData.vin || 'unknown',
            timestamp: new Date().toISOString(),
        });

        const vin = state.authorityData.vin || 'unknown';
        const isolationTags = scope
            ? MemoryTags.forVehicleAtShop(scope.shopId, vin)
            : MemoryTags.forVehicle(userId, vin);
        // Ledger-grounded only when the caller cites ledger events. The
        // writer cannot verify the ids (the ledger lands with LM-01), so an
        // empty citation stays model-sourced, and the vector-store write
        // below stays collective: shop scoping applies to the memory
        // document tags, not to the embedding surface.
        const ledgerGrounded = (scope?.ledgerEventIds?.length ?? 0) > 0;

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
                    provenance: ledgerGrounded ? 'ledger-grounded' : 'model',
                    ...(scope ? { shopId: scope.shopId, ledgerEventIds: scope.ledgerEventIds ?? [] } : {}),
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
