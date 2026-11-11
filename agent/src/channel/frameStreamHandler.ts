import { createHash } from 'node:crypto';
import {
    LiveChannelTopic,
    MAX_FRAME_STREAM_BYTES,
    SemanticTriageResultSchema,
    decodeFrameStreamAttributes,
    type ICaseRepository,
    type ILogger,
    type VisualBurstMessage,
} from '@lemonade/core';
import type { BurstAnalyzer, BurstResponder, DiagnosticJobSubmission } from '../diagnosis/BurstAnalyzer';
import type { SessionContext } from '../diagnosis/sessionContext';

/** The slice of a LiveKit room the handler needs: byte-stream registration. */
export interface ByteStreamRoom {
    registerByteStreamHandler(
        topic: string,
        handler: (reader: ByteStreamReader, participant: { identity: string }) => void,
    ): void;
}

/** The slice of a LiveKit byte-stream reader the handler needs. */
export interface ByteStreamReader {
    readonly info: {
        topic: string;
        mimeType: string;
        timestamp: number;
        totalSize?: number;
        attributes?: Record<string, string>;
    };
    readAll(): Promise<Array<Uint8Array>>;
}

/** Stores a full-resolution still and returns its storage URI. */
export interface StillStore {
    storeStill(caseId: string, frameId: string, bytes: Uint8Array): Promise<string>;
}

/**
 * Where a still is recorded: object storage for the bytes, the case ledger
 * for the reference. Both are optional; without a case id (the client sends
 * one in token metadata once the case flow exists) there is nowhere to
 * record it, and the still still reaches the reasoner.
 */
export interface StillRecorder {
    store: StillStore;
    /** Resolves the ledger repository, or undefined when the ledger is unavailable. */
    repository: () => ICaseRepository | undefined;
}

function concat(chunks: Array<Uint8Array>): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/**
 * Receives frames the mobile client streams on VisualFrameStream and hands
 * them to the BurstAnalyzer as bursts. Low-resolution frames go to the
 * talker through the fast path; a high-resolution still goes only to the
 * reasoner and the case ledger as frame_captured, never the talker.
 * Streams from anyone but the session's user, and streams with a malformed
 * header, are dropped. A ledger or storage failure is logged, never thrown:
 * it must not kill a live diagnosis.
 */
export class FrameStreamHandler {
    constructor(
        private readonly session: SessionContext,
        private readonly bursts: Pick<BurstAnalyzer, 'analyze'>,
        private readonly responder: BurstResponder,
        private readonly jobs: DiagnosticJobSubmission,
        private readonly stills: StillRecorder | undefined,
        private readonly logger: ILogger,
    ) {}

    register(room: ByteStreamRoom): void {
        room.registerByteStreamHandler(LiveChannelTopic.VisualFrameStream, (reader, participant) => {
            void this.onFrameStream(reader, participant.identity);
        });
    }

    private async onFrameStream(reader: ByteStreamReader, senderIdentity: string): Promise<void> {
        if (senderIdentity !== this.session.userId) return;

        const attributes = decodeFrameStreamAttributes(reader.info.attributes);
        if (!attributes) {
            this.logger.warn('Dropped frame stream with malformed header', { topic: reader.info.topic });
            return;
        }
        if (attributes.sessionId !== this.session.sessionId) {
            this.logger.warn('Dropped frame stream for another session', { sessionId: attributes.sessionId });
            return;
        }
        const isStill = attributes.still === 'true';
        if (isStill && attributes.resolution !== 'high') {
            this.logger.warn('Dropped still that is not full resolution', { frameId: attributes.frameId });
            return;
        }
        if (!isStill && attributes.resolution !== 'low') {
            this.logger.warn('Dropped talker frame that is not low resolution', { frameId: attributes.frameId });
            return;
        }
        if (reader.info.totalSize !== undefined && reader.info.totalSize > MAX_FRAME_STREAM_BYTES) {
            this.logger.warn('Dropped frame stream over the size limit', {
                frameId: attributes.frameId,
                totalSize: reader.info.totalSize,
            });
            return;
        }

        let chunks: Array<Uint8Array>;
        try {
            chunks = await reader.readAll();
        } catch (error) {
            this.logger.error('Failed to read frame stream', error as Error, { frameId: attributes.frameId });
            return;
        }
        const bytes = concat(chunks);
        if (bytes.byteLength > MAX_FRAME_STREAM_BYTES) {
            this.logger.warn('Dropped frame stream over the size limit', {
                frameId: attributes.frameId,
                bytes: bytes.byteLength,
            });
            return;
        }

        let stillUri: string | undefined;
        if (isStill) {
            stillUri = await this.recordStill(attributes.frameId, attributes.source, bytes, Number(attributes.capturedAt));
        }

        const burst: VisualBurstMessage = {
            frames: [Buffer.from(bytes).toString('base64')],
            component: attributes.component,
            metadata: {
                reason: attributes.reason,
                sessionId: attributes.sessionId,
                timestamp: Number(attributes.capturedAt),
                localDetections: this.parseDetections(attributes.detections, attributes.frameId),
                still: isStill || undefined,
                stillUri,
            },
        };
        try {
            this.logger.info('Analyzing streamed frame', {
                frameId: attributes.frameId,
                still: isStill,
                reason: attributes.reason,
            });
            await this.bursts.analyze(burst, this.session, this.responder, this.jobs);
        } catch (error) {
            this.logger.error('Failed to analyze streamed frame', error as Error, { frameId: attributes.frameId });
        }
    }

    private parseDetections(
        raw: string | undefined,
        frameId: string,
    ): VisualBurstMessage['metadata']['localDetections'] {
        if (!raw) return undefined;
        try {
            const parsed = SemanticTriageResultSchema.array().safeParse(JSON.parse(raw));
            if (parsed.success) return parsed.data;
            this.logger.warn('Dropped malformed triage detections on a frame stream', { frameId });
            return undefined;
        } catch {
            this.logger.warn('Dropped malformed triage detections on a frame stream', { frameId });
            return undefined;
        }
    }

    /** Stores the still and records it as a full-resolution frame_captured ledger entry. */
    private async recordStill(
        frameId: string,
        source: 'glasses' | 'phone',
        bytes: Uint8Array,
        capturedAt: number,
    ): Promise<string | undefined> {
        const caseId = this.session.caseId;
        if (!caseId) {
            this.logger.debug('no case id for this session; still will not reach the ledger');
            return undefined;
        }
        if (!this.stills) {
            this.logger.warn('no still recorder; still will not reach the ledger', { caseId });
            return undefined;
        }
        try {
            const storageUri = await this.stills.store.storeStill(caseId, frameId, bytes);
            let repository: ICaseRepository | undefined;
            try {
                repository = this.stills.repository();
            } catch (error) {
                this.logger.warn('case ledger unavailable; still will not be recorded', { error });
            }
            // Stored but not in the ledger is not a ledger reference: the
            // reasoner is only told about stills the ledger actually holds.
            if (!repository) return undefined;
            await repository.appendEntry(caseId, {
                type: 'frame_captured',
                actor: { kind: 'user', id: this.session.userId },
                source: source === 'glasses' ? 'glasses' : 'tech',
                occurredAt: new Date(capturedAt),
                payload: {
                    media: {
                        storageUri,
                        sha256: createHash('sha256').update(bytes).digest('hex'),
                    },
                    resolution: 'high',
                    capturedAt: new Date(capturedAt).toISOString(),
                },
            });
            return storageUri;
        } catch (error) {
            this.logger.error('failed to record still in the ledger', error, { caseId, frameId });
            return undefined;
        }
    }
}
