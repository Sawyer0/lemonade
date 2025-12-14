import { z } from 'zod';
import { DiagnosticSession, MessagePartSchema } from '@lemonade/core';


type Message = DiagnosticSession['messages'][number]; // This is the correct schema-defined Message type

export function useHybridBridge(messages: Message[] | undefined) {
    if (!messages || messages.length === 0) return null;

    // Scan history in reverse to find the LAST valid display_content result
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];

        // According to DiagnosticSessionSchema, msg.role is 'user' | 'assistant' | 'system' | 'tool'
        // We expect tool results to be part of a 'tool' message's content
        if (msg.role === 'tool' && Array.isArray(msg.content)) {
            // Validate each part against MessagePartSchema for safety
            const validParts = msg.content.map(p => {
                const parsed = MessagePartSchema.safeParse(p);
                return parsed.success ? parsed.data : null;
            }).filter(Boolean);


            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolPart = validParts.find((p: any) =>
                p.type === 'tool_result' &&
                (p.toolName === 'display_content' || p.toolName === 'display_web_content')
            );

            if (toolPart && toolPart.result) {
                // Validate the structure of the tool result
                const ResultSchema = z.object({
                    url: z.string().regex(/^(http|https):\/\//, "Invalid URL"),
                    type: z.string(),
                    title: z.string().optional()
                });

                const parsedResult = ResultSchema.safeParse(toolPart.result);

                if (parsedResult.success) {
                    return {
                        url: parsedResult.data.url,
                        type: parsedResult.data.type,
                        title: parsedResult.data.title || "External Content"
                    };
                } else {
                    console.warn("[HybridBridge] Invalid tool result structure:", parsedResult.error);
                }
            }
        }
    }

    return null;
}
