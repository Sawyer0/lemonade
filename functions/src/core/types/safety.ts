export interface SafetyAssessment {
    safety_score: number;
    hazards_detected: string[];
    user_intent: string;
    intervention_required: boolean;
}
