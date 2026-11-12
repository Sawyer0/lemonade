import type {
    AIAnalysis,
    NeurosymbolicState,
    SafetyRecall,
    VerificationData,
    VerificationResponse,
} from '@lemonade/core';

export interface LocalTriageDetection {
    id?: { obj: string };
    confidence?: number;
}

export interface LocalTriageDetections {
    detections: LocalTriageDetection[];
}

type FinalDiagnosis = NeurosymbolicState['finalDiagnosis'];

/** Words in a failed verification's reasoning that mark it as contradicting the hypothesis. */
const CONFLICT_MARKERS = ['electric', 'not', 'contradict', 'wrong'];

/**
 * Converts a verification model reply into the synthesis input. A failed
 * verification whose reasoning reads as a contradiction is conflicting
 * evidence, not merely unverified; without a reply there is nothing to
 * convert, so the synthesis sees an unverified result.
 */
export function verificationDataFrom(
    result: VerificationResponse | undefined,
    searchQueryUsed: string | null,
): VerificationData {
    const response = result ?? { isVerified: false, source: null, reasoning: 'No verification run' };
    const reasoningLower = (response.reasoning || '').toLowerCase();
    const isExplicitConflict =
        !response.isVerified && CONFLICT_MARKERS.some((marker) => reasoningLower.includes(marker));
    return {
        isVerified: response.isVerified,
        verifiedSource: response.source || null,
        searchQueryUsed,
        conflictingEvidence: isExplicitConflict ? response.reasoning : null,
    };
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
            // LM-37: the hand-tuned meta-confidence blend is gone, and no
            // calibrated posterior exists at this layer — the LM-04 loop's
            // calibrated posterior governs commit decisions, not this
            // field. It stays 0 (no confidence claimed) because the
            // FinalDiagnosis schema requires the number.
            metaConfidence: 0,
        };
    }

    // LM-37: the low-confidence punt lived here, driven by the deleted
    // blend. This layer no longer scores confidence at all — weak
    // intuition proceeds best-effort, and the loop escalates on its own
    // calibrated stop rule — so there is no branch left to take here.

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
            metaConfidence: 0,
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
        // LM-37: see the conflict branch above — no confidence is claimed here.
        metaConfidence: 0,
    };
}
