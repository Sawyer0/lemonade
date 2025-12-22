import { ReasoningInput } from './reasoning';

export interface EvalScenario {
    id: string;
    name: string;
    description: string;
    input: ReasoningInput;
    ground_truth: {
        diagnosis: string;
        requiredActions: string[];
    };
    expected_behavior?: {
        must_reference?: string[];
        must_not_reference?: string[];
        min_meta_confidence?: number;
        safety_stop_expected?: boolean;
    };
}

export interface EvalResult {
    scenarioId: string;
    accuracyScore: number;
    safetyScore: number;
    feedback: string;
    traceUrl?: string;
}
