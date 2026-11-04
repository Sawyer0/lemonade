import type { AIAnalysis, ILogger, MemorySearchResult, ReasoningInput, SafetyRecall } from '@lemonade/core';
import { getModelForState } from '@lemonade/core';
import type { GeminiCoreAdapter } from '../../ai/GeminiCoreAdapter';
import { parseModelJson } from './modelJson';

const THINKING_BUDGET_TOKENS = 10000;

function buildIntuitionPrompt(
    query: string,
    vehicleContext: ReasoningInput['vehicleContext'],
    recalls: SafetyRecall[],
    history: MemorySearchResult[],
): string {
    const recallText =
        recalls.length > 0
            ? recalls.map((r) => `- [${r.Component}] ${r.Summary} (Remedy: ${r.Remedy})`).join('\n')
            : 'No active recalls found.';

    const historyText =
        history.length > 0 ? history.map((h) => `- ${h.content}`).join('\n') : 'No relevant vehicle history.';

    return `
        You are an ASE Certified Master Technician with 20+ years of experience.
        You are diagnosing a vehicle issue based on a User Query, Vehicle Context, Official Recalls, and Service History.

        STEP 1: ANALYZE RECALLS
        Check if the 'Official Recalls' list matches the symptoms in the 'User Query'. 
        If there is a match, this is your primary hypothesis.

        STEP 2: FORMULATE HYPOTHESIS
        If no recall matches, use your expert knowledge of this specific Make/Model to form a hypothesis.
        Consider common failure points for this vehicle (e.g., Ford F-150 IWEs, Cam Phasers).

        STEP 3: CREATE DIAGNOSTIC PLAN
        List 3-5 specific checks to verify your hypothesis.
        - Physical checks (e.g., "Check vacuum lines")
        - Research checks (e.g., "Search for TSB 12-34-56")

        OUTPUT FORMAT: JSON ONLY
        {
            "diagnosis": "Short title of the issue",
            "confidence": 0.0 to 1.0,
            "reasoning": "Detailed explanation of why you suspect this.",
            "investigationPlan": ["Step 1", "Step 2", ...],
            "severity": "low" | "medium" | "high" | "critical",
            "safety_alert": boolean,
            "suggested_actions": ["Repair X", "Inspect Y"],
            "engineDescription": "N/A",
            "isStock": true,
            "visualConflictDetected": false,
            "detectedCondition": "unknown",
            "visual_evidence": [],
            "acoustic_evidence": []
        }

        DATA:
        User Query: "${query}"
        Vehicle: ${JSON.stringify(vehicleContext)}
        Official Recalls:
        ${recallText}
        Service History:
        ${historyText}
        `;
}

type VisualGroundingFields = Pick<
    AIAnalysis,
    | 'engineDescription'
    | 'isStock'
    | 'visualConflictDetected'
    | 'detectedCondition'
    | 'visual_evidence'
    | 'acoustic_evidence'
>;

/** Fields an intuition never fills: it reasons from text, not from imagery. */
function noVisualGrounding(): VisualGroundingFields {
    return {
        engineDescription: 'N/A',
        isStock: true,
        visualConflictDetected: false,
        detectedCondition: 'unknown',
        visual_evidence: [],
        acoustic_evidence: [],
    };
}

/**
 * System 2 intuition: asks the Pro model, with a thinking budget, for a first
 * hypothesis and investigation plan grounded in recalls and service history.
 */
export class IntuitionGenerator {
    constructor(
        private readonly coreAdapter: GeminiCoreAdapter,
        private readonly logger: ILogger,
    ) {}

    async generate(
        query: string,
        vehicleContext: ReasoningInput['vehicleContext'],
        recalls: SafetyRecall[],
        history: MemorySearchResult[],
        sessionId: string,
    ): Promise<AIAnalysis> {
        const selectedModel = getModelForState('intuition');
        this.logger.info('[MechanicReasoning] Generating Intuition (System 2)', {
            sessionId,
            model: selectedModel,
            modelReason: 'Deep diagnostic reasoning requires Pro model',
        });

        const prompt = buildIntuitionPrompt(query, vehicleContext, recalls, history);

        try {
            const model = this.coreAdapter.getGenerativeModel(
                selectedModel,
                this.coreAdapter.commonTools,
                this.coreAdapter.commonSafetySettings,
            );

            // thinkingConfig is accepted by the API but missing from the SDK's types.
            const generationConfig = {
                thinkingConfig: { thinkingBudget: THINKING_BUDGET_TOKENS, includeThoughts: false },
                temperature: 0.2,
                responseMimeType: 'application/json' as const,
            };

            const response = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig,
            });

            const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const result = parseModelJson<Partial<AIAnalysis>>(text);

            return {
                diagnosis: result.diagnosis || 'Unknown Issue',
                confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
                reasoning: result.reasoning || 'Analysis complete.',
                investigationPlan: Array.isArray(result.investigationPlan)
                    ? result.investigationPlan
                    : ['Perform visual inspection'],
                severity: result.severity || 'low',
                safety_alert: !!result.safety_alert,
                suggested_actions: Array.isArray(result.suggested_actions) ? result.suggested_actions : [],
                ...noVisualGrounding(),
            };
        } catch (error) {
            this.logger.error('Failed to generate intuition', error as Error);
            return {
                diagnosis: 'Complex Issue',
                confidence: 0.1,
                reasoning: 'Failed to generate detailed intuition.',
                investigationPlan: ['Consult manual', 'Check codes'],
                severity: 'low',
                safety_alert: false,
                suggested_actions: ['Consult human mechanic'],
                ...noVisualGrounding(),
            };
        }
    }
}
