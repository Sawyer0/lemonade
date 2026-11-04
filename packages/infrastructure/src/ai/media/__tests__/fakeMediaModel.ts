import type {
    IMediaAnalysisModel,
    MediaAnalysisRequest,
    MediaAnalysisResult,
    MediaKind,
    MessagePart,
} from '@lemonade/core';

export const VALID_ANALYSIS = {
    diagnosis: 'Worn serpentine belt',
    reasoning: 'Visible glazing on the belt ribs.',
    investigationPlan: ['Check belt tension'],
    confidence: 0.85,
    visual_evidence: ['glazed ribs'],
    acoustic_evidence: [],
    severity: 'medium',
    safety_alert: false,
    suggested_actions: ['Replace belt'],
    engineDescription: '2.0L inline-4',
    isStock: true,
    visualConflictDetected: false,
    detectedCondition: 'clean',
};

/** Scripted media model: records requests and replays results in order. */
export class FakeMediaModel implements IMediaAnalysisModel {
    readonly modelId = 'fake-media-model';
    readonly requests: MediaAnalysisRequest[] = [];
    private readonly results: (MediaAnalysisResult | Error)[] = [];

    constructor(private readonly kinds: MediaKind[] = ['image', 'video', 'audio']) {}

    reply(text: string | null, extra: Partial<MediaAnalysisResult> = {}): this {
        this.results.push({ text, toolCalls: [], model: this.modelId, ...extra });
        return this;
    }

    fail(error: Error): this {
        this.results.push(error);
        return this;
    }

    supports(kind: MediaKind): boolean {
        return this.kinds.includes(kind);
    }

    async analyze(request: MediaAnalysisRequest): Promise<MediaAnalysisResult> {
        this.requests.push(request);
        const next = this.results.shift();
        if (!next) throw new Error('FakeMediaModel has no scripted result');
        if (next instanceof Error) throw next;
        return next;
    }

    async countTokens(content: string | MessagePart[]): Promise<number> {
        return typeof content === 'string' ? content.length : content.length;
    }
}
