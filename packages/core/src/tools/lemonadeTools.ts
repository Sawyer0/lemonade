import {
    DisplayContentArgsSchema,
    GoogleSearchArgsSchema,
    SaveToMemoryArgsSchema,
    StartVideoStreamArgsSchema,
    VerifySafeSupportArgsSchema,
} from '../types/tools';
import { ToolRegistry } from './registry';
import type { ToolDefinition } from './types';

// The chat and Live tools, as one source of truth for their names, sides and
// argument schemas (LM-16). The model-facing flat names stay what the model
// already calls them by; the registry names namespace them under `chat`.
// None of these carries a handler here: server tools run in
// FunctionCallHandler and client tools run on the mobile app, so the
// registry knows them but does not execute them.
//
// verify_safe_support is a client tool, not a server tool: the mobile app
// opens the camera for it (mobile/hooks/useToolHandler.ts). An earlier
// FunctionCallHandler branch intercepted it server-side and answered with a
// canned failure, so the call never reached the camera — that branch is
// deleted and the side here is what routes it to the client.
export const CHAT_TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'chat.google_search',
        modelName: 'google_search',
        description: 'Search the web for real-world technical data, recalls, or TSBs.',
        side: 'server',
        argsSchema: GoogleSearchArgsSchema,
    },
    {
        name: 'chat.start_video_stream',
        modelName: 'start_video_stream',
        description: 'Ask the client to open the camera to see a vehicle component.',
        side: 'client',
        argsSchema: StartVideoStreamArgsSchema,
    },
    {
        name: 'chat.display_content',
        modelName: 'display_content',
        description: 'Show the user a diagram, manual page, or visual reference on their screen.',
        side: 'client',
        argsSchema: DisplayContentArgsSchema,
    },
    {
        name: 'chat.verify_safe_support',
        modelName: 'verify_safe_support',
        description:
            'Ask the client to show the vehicle support on camera before undercarriage work. Runs on the client, which holds the camera.',
        side: 'client',
        argsSchema: VerifySafeSupportArgsSchema,
    },
    {
        name: 'chat.save_to_memory',
        modelName: 'save_to_memory',
        description: 'Save an important diagnostic observation, verified fix, or vehicle history milestone.',
        side: 'server',
        argsSchema: SaveToMemoryArgsSchema,
    },
];

/** A registry holding the chat and Live tools. Reasoner tools register into the same registry. */
export function createLemonadeToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    for (const definition of CHAT_TOOL_DEFINITIONS) {
        registry.register(definition);
    }
    return registry;
}
