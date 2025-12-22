import { ILogger } from '@lemonade/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeMessages(messages: any[], logger: ILogger): any[] {
    let filteredMessages = messages.filter(m => m.role !== 'system');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filteredMessages = filteredMessages.reduce((acc: any[], msg, index, array) => {
        const safeMsg = { ...msg };

        if (Array.isArray(safeMsg.content)) {
            safeMsg.content = safeMsg.content.map((p: unknown) => {
                if (!p || typeof p !== 'object') return { type: 'text', text: '[Invalid Part]' };

                const part = p as { type: string; image?: string };

                if (part.type === 'image' && typeof part.image === 'string') {
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

        if (safeMsg.role === 'assistant' && Array.isArray(safeMsg.content)) {
            safeMsg.content = safeMsg.content.filter((p: unknown) => (p as { type: string }).type !== 'tool-result');
        }

        const isEmptyString = typeof safeMsg.content === 'string' && safeMsg.content.trim() === '';
        const isEmptyArray = Array.isArray(safeMsg.content) && safeMsg.content.length === 0;

        if (!safeMsg.content || isEmptyString || isEmptyArray) {
            return acc;
        }

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

