import type { Content, GenerateContentCandidate, Part } from '@google-cloud/vertexai';
import type { AIAnalysis, MessagePart } from '@lemonade/core';
import { SafetyPrompts, SystemPrompts } from '@lemonade/core';

export interface ChatHistoryMessage {
    role: string;
    content?: unknown;
}

interface GroundingChunk {
    web?: { title?: string; uri?: string };
}

function messagePartToVertex(part: MessagePart): Part {
    if (part.type === 'text' && part.text) return { text: part.text };
    if (part.type === 'image' && part.image) return { fileData: { mimeType: 'image/jpeg', fileUri: part.image } };
    return { text: '' };
}

/**
 * Converts app chat history into Vertex content. With stringifyObjects, a
 * non-string, non-array message body is sent as JSON instead of dropped.
 */
export function toVertexHistory(history: ChatHistoryMessage[], stringifyObjects: boolean): Content[] {
    return history.map((msg) => {
        let parts: Part[] = [];
        if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
            parts = (msg.content as MessagePart[]).map(messagePartToVertex);
        } else if (stringifyObjects && msg.content !== null && msg.content !== undefined) {
            parts.push({ text: JSON.stringify(msg.content) });
        }
        return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
    });
}

/** The first user turn: identity, prime directives, vehicle and diagnosis context, then the message. */
export function buildUserParts(
    message: string,
    vehicleContext: string,
    diagnosticContext: AIAnalysis | null,
    additionalParts?: Part[],
): Part[] {
    const contextPrompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        CONTEXT:
        Vehicle: ${vehicleContext}
        Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
        
        ${SafetyPrompts.masterTechInstruction()}
        `;

    const userParts: Part[] = [{ text: `${contextPrompt}\n\nUSER MESSAGE:\n${message}` }];
    if (additionalParts && additionalParts.length > 0) {
        userParts.push(...additionalParts);
    }
    return userParts;
}

/** Markdown source list for a grounded answer, or an empty string when ungrounded. */
export function formatGroundingSources(candidate: GenerateContentCandidate | undefined): string {
    const chunks = candidate?.groundingMetadata?.groundingChunks as GroundingChunk[] | undefined;
    if (!chunks || chunks.length === 0) return '';

    const sources: string[] = [];
    chunks.forEach((chunk, index) => {
        if (chunk.web) sources.push(`[${index + 1}] [${chunk.web.title}](${chunk.web.uri})`);
    });
    return sources.length > 0 ? `\n\n**Sources:**\n${sources.join('\n')}` : '';
}

/** Converts countable content (text, app message parts or raw Vertex parts) into Vertex parts. */
export function toCountableParts(content: string | MessagePart[] | Part[]): Part[] {
    if (typeof content === 'string') return [{ text: content }];
    if (!Array.isArray(content) || content.length === 0) return [];

    const first = content[0];
    const looksLikeParts = 'type' in first || 'text' in first || 'inlineData' in first || 'fileData' in first;
    if (!looksLikeParts) return content as Part[];

    return (content as MessagePart[])
        .map((part): Part => {
            if (part.type === 'text' && part.text) return { text: part.text };
            if (part.type === 'image' && part.image) {
                if (part.image.startsWith('http') || part.image.startsWith('gs://')) {
                    return { fileData: { mimeType: 'image/jpeg', fileUri: part.image } };
                }
                if (part.image.startsWith('data:')) {
                    const matches = part.image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        return { inlineData: { mimeType: matches[1], data: matches[2] } };
                    }
                }
            }
            return { text: '' };
        })
        .filter((p) => ('text' in p && p.text !== '') || 'fileData' in p || 'inlineData' in p);
}

export function newToolCallId(): string {
    return 'call_' + Math.random().toString(36).substring(2, 11);
}
