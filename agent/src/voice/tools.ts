import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { RoomPublisher } from '../channel/roomPublisher';

/** Tools the realtime model can call during a live session. */
export function createMasterTechTools(publisher: RoomPublisher) {
    return {
        start_video_stream: llm.tool({
            description: 'Ask the device for fresh high-resolution frames of a part you need to inspect.',
            parameters: z.object({
                component: z.string().describe('The part to see, e.g. "engine belt" or "brake rotor"'),
                reason: z.string().describe('Why you need to see it'),
            }),
            execute: async ({ component, reason }) => {
                await publisher.requestVisualBurst(component, reason);
                return `Requesting visual data for ${component}. Ask the user to point the camera at it.`;
            },
        }),
    };
}
