import { ILogger } from '@/core/interfaces/ILogger';

/**
 * Sanitizes chat messages to ensure compatibility with AI models and DB storage.
 * - Removes system messages (unless preserved).
 * - Filters out empty content.
 * - Handles dangling tool calls.
 * - Converts video objects to text placeholders (if not supported).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeMessages(messages: any[], logger: ILogger): any[] {
    // Filter out system messages
    let filteredMessages = messages.filter(m => m.role !== 'system');

    // Reduce to sanitize content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filteredMessages = filteredMessages.reduce((acc: any[], msg, index, array) => {
        const safeMsg = { ...msg };

        // 0. Pre-Sanitize Content Parts for Semantic Validity
        if (Array.isArray(safeMsg.content)) {
            safeMsg.content = safeMsg.content.map((p: unknown) => {
                // Safe guard: p must be an object
                if (!p || typeof p !== 'object') return { type: 'text', text: '[Invalid Part]' };

                const part = p as { type: string; image?: string };

                if (part.type === 'image' && typeof part.image === 'string') {
                    // Check if it's actually a video URL
                    const url = part.image.toLowerCase();
                    const isVideo = url.endsWith('.mp4') ||
                        url.endsWith('.mov') ||
                        url.endsWith('.webm') ||
                        url.endsWith('.avi') ||
                        url.endsWith('.mkv') ||
                        url.includes('/video/');

                    if (isVideo) {
                        return { type: 'text', text: `[Context: User uploaded a video at ${part.image}]` };
                    }
                }
                return p;
            });
        }

        // 1. Sanitize Assistant Messages: Remove 'tool-result' parts if they wrongly appear in assistant role
        if (safeMsg.role === 'assistant' && Array.isArray(safeMsg.content)) {
            safeMsg.content = safeMsg.content.filter((p: unknown) => (p as { type: string }).type !== 'tool-result');
        }

        // 2. Skip messages that became empty after sanitization
        const isEmptyString = typeof safeMsg.content === 'string' && safeMsg.content.trim() === '';
        const isEmptyArray = Array.isArray(safeMsg.content) && safeMsg.content.length === 0;

        if (!safeMsg.content || isEmptyString || isEmptyArray) {
            return acc;
        }

        // 3. Check for dangling tool calls
        const hasToolCall = Array.isArray(safeMsg.content) && safeMsg.content.some((p: unknown) => (p as { type: string }).type === 'tool-call');
        if (safeMsg.role === 'assistant' && hasToolCall) {
            const nextMsg = array[index + 1];
            if (!nextMsg || nextMsg.role !== 'tool') {
                logger.warn('Sanitization: Dropping dangling assistant tool-call message', { index });
                return acc;
            }
        }

        acc.push(safeMsg);
        return acc;
    }, []);

    return filteredMessages;
}
