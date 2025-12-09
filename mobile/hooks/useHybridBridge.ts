import { DiagnosticSession } from '../core/types/models';
import { MessagePartSchema } from '../../src/core/types/models'; // Explicitly import MessagePartSchema

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


            const toolPart = validParts.find((p: any) =>
                p.type === 'tool_result' &&
                (p.toolName === 'display_content' || p.toolName === 'display_web_content')
            );

            if (toolPart && toolPart.result) {
                // Assuming toolPart.result is { url: string; type: string; title: string }
                return toolPart.result as { url: string; type: string; title: string };
            }
        }
    }

    return null;
}
