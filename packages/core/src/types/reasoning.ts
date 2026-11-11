import { LocalTriageResult } from './localPerception';
import type { ParsedDtc } from '../dtc/types';

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
    videoDurationMinutes?: number; // From runVisionAnalysis
    localTriage?: LocalTriageResult;
    /** Parsed DTCs for the session (LM-02), from the deterministic parser. */
    dtcCodes?: ParsedDtc[];
}
