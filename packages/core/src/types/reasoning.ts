import { LocalTriageResult } from './localPerception';
import type { ParsedDtc } from '../dtc/types';
import type { ReasonerScanData } from '../reasoning/types';

export interface ReasoningInput {
    userQuery: string;
    videoUrl?: string;
    vehicleContext: {
        year?: number;
        make?: string;
        model?: string;
        engine?: string;
        trim?: string;
        vin?: string;
    };
    sessionId: string;
    userId: string;
    complaint?: string;
    // LM-17: when the diagnosis belongs to a case, the run is queued per
    // case (one active run, evidence folded in at checkpoints) and commits
    // with the case version it read. Without it the run behaves as before.
    caseId?: string;
    videoDurationMinutes?: number; // From runVisionAnalysis
    localTriage?: LocalTriageResult;
    /** Parsed DTCs for the session (LM-02), from the deterministic parser. */
    dtcCodes?: ParsedDtc[];
    /**
     * Recorded scan data for the reasoner loop (LM-16): a freeze frame and
     * a PID log. Without it the `investigating` state's reasoner region
     * completes immediately and the diagnosis runs as before.
     */
    scanData?: ReasonerScanData;
}
