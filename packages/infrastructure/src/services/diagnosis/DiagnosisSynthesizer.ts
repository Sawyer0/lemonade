import type { AIAnalysis, DeepPartial, NeurosymbolicState, SafetyRecall, VerificationData } from '@lemonade/core';

export interface LocalTriageDetection {
    id?: { obj: string };
    confidence?: number;
}

export interface LocalTriageDetections {
    detections: LocalTriageDetection[];
}

type FinalDiagnosis = NeurosymbolicState['finalDiagnosis'];

/**
 * Meta-confidence in [0, 1]: half the model's own confidence, raised by external
 * verification, consensus, a recall match and agreeing on-device detections, and
 * lowered by contradicting evidence.
 */
export function calculateMetaConfidence(
    intuition: AIAnalysis,
    consensus: unknown[],
    verification: VerificationData,
    localTriage?: LocalTriageDetections,
    hasRecallMatch: boolean = false,
): number {
    let score = intuition.confidence * 0.5;
    if (verification.isVerified) score += 0.4;
    else if (verification.conflictingEvidence) score -= 0.2;
    if (consensus.length > 0) score += 0.1;
    if (hasRecallMatch) score += 0.3;

    if (localTriage?.detections?.length && intuition.diagnosis) {
        const match = localTriage.detections.find(
            (d) =>
                (d.confidence || 0) > 0.7 &&
                d.id?.obj &&
                intuition.diagnosis.toLowerCase().includes(d.id.obj.toLowerCase()),
        );
        if (match) score = Math.min(1.0, score + 0.1);
    }

    return Math.max(0, Math.min(1, score));
}

/** The first recall whose component or summary lines up with the diagnosis. */
export function findMatchingRecall(diagnosis: string, recalls: SafetyRecall[]): SafetyRecall | undefined {
    const lower = diagnosis.toLowerCase();
    return recalls.find(
        (r) =>
            lower.includes(r.Component.toLowerCase()) ||
            (r.Summary && lower.split(' ').some((word) => r.Summary.toLowerCase().includes(word) && word.length > 3)),
    );
}

/**
 * Reflexion step: weighs the hypothesis against recalls, consensus, verification
 * and on-device detections, and decides whether to proceed, stop for safety,
 * ask for more information, or refer to a human.
 */
export function synthesizeDiagnosis(
    intuition: AIAnalysis,
    recalls: SafetyRecall[],
    consensus: unknown[],
    verification: VerificationData,
    localTriage?: LocalTriageDetections,
): FinalDiagnosis {
    const decisionTrace: string[] = [];
    const activeRecalls = recalls || [];
    let diagnosis = intuition.diagnosis;
    let actions = intuition.suggested_actions || [];

    if (localTriage?.detections?.length) {
        const highConfDetections = localTriage.detections.filter((d) => (d.confidence || 0) > 0.8);
        if (highConfDetections.length > 0) {
            const parts = highConfDetections.map((d) => d.id?.obj || 'unknown').join(', ');
            decisionTrace.push(`LOCAL GROUNDING: On-device triage confirmed ${parts} with high confidence.`);
        }
    }

    const recallMatch = findMatchingRecall(diagnosis, activeRecalls);

    if (recallMatch) {
        decisionTrace.push(`RECALL MATCH: Symptoms align with Recall on ${recallMatch.Component}.`);
        diagnosis = `RECALL IDENTIFIED: ${recallMatch.Component}. ${recallMatch.Summary}`;
        actions = [recallMatch.Remedy || 'Contact your local dealer for a free repair.', ...actions];
    } else if (activeRecalls.length > 0) {
        decisionTrace.push(
            `ALERT: Found ${activeRecalls.length} active recalls. No direct match found to current symptoms.`,
        );
    }

    if (verification.conflictingEvidence) {
        const conflict = verification.conflictingEvidence;
        decisionTrace.push('CRITICAL CONFLICT: Ground truth contradicts intuition.');
        return {
            decision: 'REFER_TO_HUMAN',
            reasoningTrace: decisionTrace.join('\n'),
            userOutput: `CONFLICT DETECTED: My initial analysis suggests "${diagnosis}", but technical records indicate: ${conflict}. This requires human verification to avoid incorrect repair.`,
            requiredActions: ['Consult Human Mechanic', 'Verify with Technical Manual'],
            metaConfidence: 0.5,
        };
    }

    const metaConfidence = calculateMetaConfidence(intuition, consensus, verification, localTriage, !!recallMatch);
    decisionTrace.push(`META-COGNITION: Final confidence calculated at ${(metaConfidence * 100).toFixed(1)}%`);

    // Only punt when there is no grounding at all and confidence is very low.
    if (metaConfidence < 0.3 && !recallMatch && !verification.isVerified) {
        const typedIntuition = intuition as DeepPartial<AIAnalysis>;
        if (typedIntuition.investigationPlan && typedIntuition.investigationPlan.length > 0) {
            decisionTrace.push('LOW CONFIDENCE: Initiating iterative diagnosis request.');
            return {
                decision: 'REQUEST_MORE_INFO',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: `I have a hypothesis (${diagnosis}), but I need you to check a few things to be sure:\n\n${typedIntuition.investigationPlan.map((step) => `- ${step}`).join('\n')}\n\nCan you perform these checks and tell me what you find?`,
                requiredActions: typedIntuition.investigationPlan as string[],
                metaConfidence: metaConfidence,
            };
        }

        decisionTrace.push('LOW CONFIDENCE: No grounding found and initial intuition is extremely weak.');
        return {
            decision: 'REFER_TO_HUMAN',
            reasoningTrace: decisionTrace.join('\n'),
            userOutput:
                "I'm having trouble forming a confident diagnosis with the available information. To be safe, I recommend consulting a human mechanic for a physical inspection.",
            requiredActions: ['Consult Human Mechanic'],
            metaConfidence: metaConfidence,
        };
    }

    const strongConsensusContradiction =
        consensus.length > 2 &&
        (consensus[0] as { text: string }).text !== intuition.diagnosis &&
        !verification.isVerified;
    if (strongConsensusContradiction) {
        decisionTrace.push(
            'COMPLEX CONFLICT: Consensus strongly contradicts intuition, but verification is inconclusive. Referring to human.',
        );
        return {
            decision: 'REFER_TO_HUMAN',
            reasoningTrace: decisionTrace.join('\n'),
            userOutput:
                'My analysis conflicts with strong community consensus, and I cannot verify a definitive solution. Please refer to a human expert.',
            requiredActions: ['Consult Human Mechanic'],
            metaConfidence: 0.4,
        };
    }

    let userOutput = verification.isVerified ? `${diagnosis} (Verified by external data)` : diagnosis;

    if (activeRecalls.length > 0 && !recallMatch) {
        const firstRecall = activeRecalls[0];
        if (!diagnosis.toLowerCase().includes('recall')) {
            userOutput += `\n\n⚠️ NOTE: While not directly related to your current symptoms, we found ${activeRecalls.length} active recall(s) for your vehicle (e.g., ${firstRecall.Component}). You should check these with your dealer.`;
        }
    }

    decisionTrace.push('Proceeding with best-effort diagnosis.');

    let decision: 'PROCEED' | 'STOP_DANGER' | 'REFER_TO_HUMAN' = 'PROCEED';
    if (intuition.safety_alert || intuition.severity === 'critical') {
        decision = 'STOP_DANGER';
        decisionTrace.push('SAFETY STOP: AI identified a critical safety issue.');
    }

    return {
        decision,
        reasoningTrace: decisionTrace.join('\n'),
        userOutput,
        requiredActions: actions,
        metaConfidence,
    };
}
