import type {
    AIAnalysis,
    ILiveStreamAnalyzer,
    IMechanicReasoningService,
    LocalTriageResult,
    MessagePart,
    VisualBurstMessage,
} from '@lemonade/core';
import type { SessionContext } from './sessionContext';

/** Where the analyzer's findings go: spoken to the user, or handed to the device as a tool call. */
export interface BurstResponder {
    say(text: string): Promise<void>;
    requestTool(call: { id: string; name: string; args: Record<string, unknown> }): Promise<void>;
}

/** Systems whose faults need the full reasoning pipeline (recalls, manuals, verification). */
const COMPLEX_SYSTEMS = ['abs', 'hybrid', 'transmission', 'ecu', 'airbag', 'high voltage'];

function isComplex(triage: LocalTriageResult | undefined): boolean {
    return (
        triage?.detections.some((d) => {
            const label = `${d.id.obj} ${d.id.cat}`.toLowerCase();
            return COMPLEX_SYSTEMS.some((system) => label.includes(system));
        }) ?? false
    );
}

function isAnalysis(result: AIAnalysis | MessagePart[]): result is AIAnalysis {
    return !Array.isArray(result);
}

/**
 * Routes frames from the device. Complex systems go through the System 2
 * reasoning service; everything else gets a fast live-frame analysis whose
 * text is spoken back or whose tool calls are forwarded to the device.
 */
export class BurstAnalyzer {
    constructor(
        private readonly reasoning: IMechanicReasoningService,
        private readonly liveFrames: ILiveStreamAnalyzer,
    ) {}

    async analyze(burst: VisualBurstMessage, session: SessionContext, respond: BurstResponder): Promise<void> {
        const component = burst.component ?? 'part';
        const detections = burst.metadata.localDetections;
        const triage: LocalTriageResult | undefined = detections?.length
            ? { detections, timestamp: burst.metadata.timestamp }
            : undefined;

        if (isComplex(triage)) {
            await respond.say(`Scanning the ${component} system. One moment...`);
            const state = await this.reasoning.diagnose({
                userQuery: `Analyze the ${component} for issues.`,
                vehicleContext: session.vehicle,
                sessionId: session.sessionId,
                userId: session.userId,
                localTriage: triage,
            });
            await respond.say(state.finalDiagnosis.userOutput);
            return;
        }

        const result = await this.liveFrames.analyzeLiveImageFrame(
            burst.frames[0],
            'image/jpeg',
            session.vehicleJson,
            session.userId,
            session.sessionId,
            session.vehicle.vin,
            burst.metadata.timestamp,
            triage,
        );
        if (!result) return;

        if (isAnalysis(result)) {
            await respond.say(result.diagnosis);
            return;
        }

        for (const part of result) {
            if (part.type === 'tool-call' && part.toolCallId && part.toolName) {
                const args = part.args && typeof part.args === 'object' ? (part.args as Record<string, unknown>) : {};
                await respond.requestTool({ id: part.toolCallId, name: part.toolName, args });
            }
        }
    }
}
