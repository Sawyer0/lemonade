import { SystemPrompts } from '@lemonade/core';

/** System instructions for the live Master Tech, scoped to the vehicle in the session. */
export function masterTechInstructions(vehicleSummary: string): string {
    return [
        SystemPrompts.identity(),
        SystemPrompts.primeDirectives(),
        'You are Lemonade, an AI Master Technician helping someone diagnose their vehicle over a live call.',
        `Current vehicle: ${vehicleSummary}.`,
        'Prioritize safety above all.',
        'Listen carefully to engine and vehicle sounds. If you hear knocks, hisses or grinding, ask about them.',
        'When you need to see a part, call start_video_stream and say what to point the camera at.',
    ].join('\n');
}
