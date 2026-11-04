import type {
    IMediaAnalysisModel,
    MediaAnalysisRequest,
    MediaAnalysisResult,
    MediaKind,
    MessagePart,
} from '@lemonade/core';
import { AppError, ErrorCode } from '@lemonade/core';
import type { ChatCompletionClient } from './ChatCompletionClient';
import { estimateTokens } from './CompletionChatAdapter';

/** Image tokens are provider-specific; Groq's vision models count each image as up to 2048. */
const IMAGE_TOKEN_ESTIMATE = 2048;

const STRUCTURED_INSTRUCTION =
    'Reply with one JSON object only, using exactly the fields of the analysis format described above.';

/**
 * Any OpenAI-compatible vision model (Groq by default) behind the media
 * analysis port. Chat-completion APIs take images only, so video and audio are
 * reported as unsupported, and Gemini function calling is not available here.
 */
export class CompletionMediaModel implements IMediaAnalysisModel {
    constructor(private readonly client: ChatCompletionClient) {}

    get modelId(): string {
        return this.client.model;
    }

    supports(kind: MediaKind): boolean {
        return kind === 'image';
    }

    async analyze(request: MediaAnalysisRequest): Promise<MediaAnalysisResult> {
        const { media } = request;
        if (!this.supports(media.kind)) {
            throw new AppError(
                ErrorCode.INVALID_CONTENT_TYPE,
                `${this.modelId} cannot analyze ${media.kind}; use LLM_PROVIDER=vertex for ${media.kind} analysis.`,
            );
        }

        const url = media.data ? `data:${media.mimeType};base64,${media.data}` : (media.uri ?? '');
        if (!url.startsWith('data:') && !url.startsWith('http')) {
            throw new AppError(ErrorCode.INVALID_INPUT, `${this.modelId} needs an https or inline image, got ${url}`);
        }

        const prompt = request.structured ? `${request.prompt}\n\n${STRUCTURED_INSTRUCTION}` : request.prompt;
        const result = await this.client.completeWithUsage({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url } },
                    ],
                },
            ],
            temperature: request.realtime ? 0.1 : 0.2,
            jsonMode: request.structured,
        });

        return { text: result.content || null, toolCalls: [], usage: result.usage, model: this.modelId };
    }

    async countTokens(content: string | MessagePart[]): Promise<number> {
        if (typeof content === 'string') return estimateTokens(content);
        return content.reduce((total, part) => {
            if (part.type === 'text' && part.text) return total + estimateTokens(part.text);
            if (part.type === 'image' && part.image) return total + IMAGE_TOKEN_ESTIMATE;
            return total;
        }, 0);
    }
}
