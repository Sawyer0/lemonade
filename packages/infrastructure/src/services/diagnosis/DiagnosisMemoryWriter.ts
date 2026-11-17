import type {
    IEmbeddingService,
    ILogger,
    ISessionRepository,
    IVectorRepository,
    NeurosymbolicState,
} from '@lemonade/core';

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
 * Persists a confident diagnosis in the shop-owned vector store (LM-31):
 * an embedding of the complaint for similar-case recall, with the
 * diagnostic log and — for verified cases — the session's video and image
 * references attached as record metadata, so the log and its artifacts
 * are recalled with the case instead of living in a third-party store.
 *
 * This writer persists diagnostic logs, never vehicle facts. A vehicle fact is
 * created only by the core write policy (LM-31) from ledger events. When the
 * caller passes a shop scope, the record is scoped to the shop that holds the
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
        const vin = state.authorityData.vin || 'unknown';
        // Ledger-grounded only when the caller cites ledger events. The
        // writer cannot verify the ids (the LM-01 adapter has not landed
        // yet), so an empty citation stays model-sourced, and the
        // vector-store write below stays collective: shop scoping applies
        // to the record metadata, not to the embedding surface.
        const ledgerGrounded = (scope?.ledgerEventIds?.length ?? 0) > 0;

        // Verified cases carry their session artifacts on the vector
        // record, so the video and images are recalled with the diagnosis.
        // A failed artifact read degrades to a record without them.
        let videoUrl: string | undefined;
        let imageUrls: string[] = [];
        if (state.verification.isVerified) {
            try {
                const artifacts = await this.collectSessionArtifacts(sessionId);
                videoUrl = artifacts.videoUrl;
                imageUrls = artifacts.imageUrls;
            } catch (error) {
                this.logger.warn('Failed to collect session artifacts', { error, sessionId });
            }
        }

        await this.vectorRepo.addCase(text, vector, {
            userId: userId,
            diagnosis: state.finalDiagnosis.userOutput,
            vehicle: vin,
            timestamp: new Date().toISOString(),
            sessionId,
            isVerified: state.verification.isVerified,
            provenance: ledgerGrounded ? 'ledger-grounded' : 'model',
            ...(scope ? { shopId: scope.shopId, ledgerEventIds: scope.ledgerEventIds ?? [] } : {}),
            diagnosticLog: formatDiagnosticLog(text, state),
            ...(videoUrl ? { videoUrl } : {}),
            ...(imageUrls.length > 0 ? { imageUrls } : {}),
        });

        this.logger.info('Diagnostic session saved to vector store', { vin, sessionId });
    }

    private async collectSessionArtifacts(sessionId: string): Promise<{ videoUrl?: string; imageUrls: string[] }> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) return { imageUrls: [] };

        const imageUrls = new Set<string>();
        session.messages.forEach((msg) => {
            if (Array.isArray(msg.content)) {
                msg.content.forEach((part) => {
                    if (part.type === 'image' && part.image) imageUrls.add(part.image);
                });
            }
        });

        return { videoUrl: session.videoUrl ?? undefined, imageUrls: [...imageUrls] };
    }
}
