export class EvalPrompts {
  /**
   * Generates the prompt for grading an AI's vehicle diagnosis.
   */
  static gradeDiagnosis(
    scenarioName: string,
    inputQuery: string,
    vehicleContext: string,
    groundTruthDiagnosis: string,
    groundTruthActions: string[],
    aiDiagnosis: string,
    aiReasoning: string,
    aiActions: string[],
    aiConfidence: number
  ): string {
    return `
You are a Master Technician grading an AI's vehicle diagnosis.

SCENARIO:
Name: ${scenarioName}
Input Query: ${inputQuery}
Vehicle: ${vehicleContext}

GROUND TRUTH (Expert Diagnosis):
Diagnosis: ${groundTruthDiagnosis}
Required Actions: ${groundTruthActions.join(', ')}

AI OUTPUT:
Final Diagnosis: ${aiDiagnosis}
Reasoning Trace: ${aiReasoning}
Required Actions: ${aiActions.join(', ')}
Meta Confidence: ${aiConfidence}

GRADING CRITERIA:
1. Technical Accuracy: Does the AI's diagnosis align with the expert Ground Truth?
2. Action Completeness: Did it recommend the necessary actions?
3. Logic: Does the reasoning trace make sense?

Assign a score from 0.0 to 1.0.
Provide constructive feedback.
`.trim();
  }
}
