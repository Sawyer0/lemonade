import { NeurosymbolicState } from "@/core/types/neurosymbolic";

export interface ReasoningInput {
    sessionId: string;
    userId: string;
    userQuery: string;
    videoUrl?: string; // Optional: The visual input
    vehicleContext: {
        year: number;
        make: string;
        model: string;
        vin?: string;
    };
}

/**
 * System 2 Orchestrator: The "Brain" that runs the Reflexion Loop.
 */
export interface IMechanicReasoningService {
    /**
     * Executes the 4-Node verification loop (Perception -> Authority -> Consensus -> Synthesis).
     * Returns a strictly typed NeurosymbolicState.
     */
    diagnose(input: ReasoningInput): Promise<NeurosymbolicState>;

    /**
     * Analyzes a manual specifically, using context caching and reasoning.
     */
    analyzeManual(sessionId: string, manualUrl: string, query: string): Promise<string>;
}
