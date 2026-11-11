import type {
    CreateDiagnosticJobInput,
    ILiveStreamAnalyzer,
    IMechanicReasoningService,
    LocalTriageResult,
    MessagePart,
    AIAnalysis,
    VisualBurstMessage,
} from '@lemonade/core';
import type { SessionContext } from './sessionContext';

/** Where the analyzer's findings go: spoken to the user, or handed to the device as a tool call. */
export interface BurstResponder {
    say(text: string): Promise<void>;
    requestTool(call: { id: string; name: string; args: Record<string, unknown> }): Promise<void>;
}

/** Files a diagnostic job with the job service and starts tracking it for delivery. */
export interface DiagnosticJobSubmission {
    submitJob(request: CreateDiagnosticJobInput): Promise<{ jobId: string }>;
    trackJob(jobId: string): void;
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
 * Routes frames from the device. A full-resolution still goes to the
 * reasoner (LM-15), never the fast live-frame path the talker uses. Complex
 * systems go to the diagnostic backend as a non-blocking job ticket (LM-14):
 * the job id comes back fast, the talker keeps the tech working, and the
 * ResultInjector speaks the finding at the next idle gap. Everything else
 * gets a fast live-frame analysis whose text is spoken back or whose tool
 * calls are forwarded to the device.
 */
export class BurstAnalyzer {
    constructor(
        private readonly reasoning: IMechanicReasoningService,
        private readonly liveFrames: ILiveStreamAnalyzer,
    ) {}

    async analyze(
        burst: VisualBurstMessage,
        session: SessionContext,
        respond: BurstResponder,
        jobs: DiagnosticJobSubmission,
    ): Promise<void> {
        const component = burst.component ?? 'part';
        const detections = burst.metadata.localDetections;
        const triage: LocalTriageResult | undefined = detections?.length
            ? { detections, timestamp: burst.metadata.timestamp }
            : undefined;

        // A full-resolution still goes only to the reasoner, never the fast
        // live-frame path the talker uses. The still itself is in the case
        // ledger (see FrameStreamHandler); the reasoner gets its reference.
        if (burst.metadata.still) {
            await respond.say(`Scanning the ${component} system. One moment...`);
            const stillNote = burst.metadata.stillUri
                ? ` A full-resolution still is in the case ledger: ${burst.metadata.stillUri}.`
                : '';
            const state = await this.reasoning.diagnose({
                userQuery: `Analyze the ${component} for issues.${stillNote}`,
                vehicleContext: session.vehicle,
                sessionId: session.sessionId,
                userId: session.userId,
                localTriage: triage,
            });
            await respond.say(state.finalDiagnosis.userOutput);
            return;
        }

        if (isComplex(triage)) {
            try {
                const { jobId } = await jobs.submitJob({
                    question: `Analyze the ${component} for issues.`,
                    evidenceRefs: (triage?.detections ?? []).map((d) => `${d.id.obj} (${d.id.cat})`),
                    caseId: session.caseId,
                    sessionId: session.sessionId,
                    userId: session.userId,
                    vehicle: session.vehicle,
                    localTriage: triage,
                });
                jobs.trackJob(jobId);
                await respond.say(`Scanning the ${component} system. One moment...`);
            } catch {
                await respond.say(
                    `The diagnostician is unreachable right now, so I can't check the ${component} system yet.`,
                );
            }
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
