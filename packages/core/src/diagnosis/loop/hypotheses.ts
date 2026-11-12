// Hypothesis set (LM-04): priors in, a ranked differential with an
// explicit OTHER bucket out.
//
// Priors come from field-fix frequency (LM-33), smoothed with
// knowledge-graph/FMEA priors (LM-38) as pi(h) = (n_h + alpha*q(h)) /
// (N + alpha); a matching TSB boosts the prior. The LLM may propose
// hypothesis names but never sets numbers: every proposal gets the same
// floor probability, taken proportionally from the prior mass. The logic
// filter drops hypotheses a reading contradicts and moves their mass to
// OTHER, so the loop can never be more certain than the evidence allows.
import { SHARED_CONFIG } from '../../config';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { Differential, DiagnosticLoopInput, LoopHypothesis } from './types';

const LOOP = SHARED_CONFIG.DIAGNOSTIC_LOOP;

/**
 * Blends a knowledge-graph/FMEA prior q(h) into a field-fix count:
 * pi(h) = (n_h + alpha*q(h)) / (N + alpha). With no observations the
 * knowledge prior stands; with many, the field data dominates.
 */
export function blendKnowledgePrior(n: number, totalN: number, knowledgePrior: number, alpha: number): number {
    if (!Number.isFinite(n) || n < 0 || !Number.isFinite(totalN) || totalN < 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Fix counts must be non-negative numbers');
    }
    if (!Number.isFinite(alpha) || alpha <= 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Knowledge blend alpha must be a positive number');
    }
    if (!Number.isFinite(knowledgePrior) || knowledgePrior < 0 || knowledgePrior > 1) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Knowledge prior must be a probability');
    }
    return (n + alpha * knowledgePrior) / (totalN + alpha);
}

/** Normalises hypothesis ids for matching: lowercase, trimmed, single spaces. */
export function normalizeHypothesisId(id: string): string {
    return id.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scaleProbabilities(hypotheses: LoopHypothesis[], factor: number): LoopHypothesis[] {
    return hypotheses.map((hypothesis) => ({ ...hypothesis, probability: hypothesis.probability * factor }));
}

/**
 * Builds the opening differential. Priors are scaled to leave the OTHER
 * floor; a TSB match multiplies the prior before that scaling; a
 * knowledge prior re-weights a hypothesis through blendKnowledgePrior;
 * LLM proposals join at the fixed floor. The probabilities always sum
 * to 1 with OTHER, and the order is probability descending, then id.
 */
export function buildDifferential(input: DiagnosticLoopInput): Differential {
    const boosted = new Set((input.tsbBoostedHypothesisIds ?? []).map(normalizeHypothesisId));
    const totalN = input.priorHypotheses.reduce((sum, prior) => sum + prior.n, 0);
    const alpha = SHARED_CONFIG.PRIORS.SMOOTHING_ALPHA;

    let hypotheses: LoopHypothesis[] = input.priorHypotheses.map((prior) => {
        const id = normalizeHypothesisId(prior.hypothesis);
        let pi = prior.pi;
        if (input.knowledgePriors?.[id] !== undefined) {
            pi = blendKnowledgePrior(prior.n, totalN, input.knowledgePriors[id] as number, alpha);
        }
        if (boosted.has(id)) {
            pi *= LOOP.TSB_BOOST;
        }
        return {
            id,
            label: prior.hypothesis,
            probability: pi,
            source: 'field-fix-prior' as const,
            n: prior.n,
            provenance: prior.sources.map((source) => `${source.source} ${source.observationCount}`),
        };
    });

    // LLM proposals: names only. A proposal already in the priors adds
    // nothing; a new one joins at the floor, its mass taken from the
    // priors. The priors are scaled to exactly the mass left after
    // OTHER and the proposals, so each proposal keeps the floor
    // exactly — no later renormalisation touches it. When so many
    // proposals arrive that the floor would exceed the available mass,
    // they split it equally instead: still equal, still never a number
    // from the model.
    const known = new Set(hypotheses.map((hypothesis) => hypothesis.id));
    const proposals = [
        ...new Set(
            (input.llmHypotheses ?? []).map(normalizeHypothesisId).filter((id) => id.length > 0 && !known.has(id)),
        ),
    ];
    const availableMass = 1 - LOOP.OTHER_FLOOR;
    const priorSum = hypotheses.reduce((sum, hypothesis) => sum + hypothesis.probability, 0);
    if (proposals.length > 0) {
        if (hypotheses.length === 0) {
            // No priors at all: the proposals split what is left of OTHER.
            const share = availableMass / proposals.length;
            hypotheses = proposals.map((id) => ({
                id,
                label: id,
                probability: share,
                source: 'llm-proposed' as const,
                provenance: ['llm proposal: name only, floor probability'],
            }));
        } else {
            const proposalMass = Math.min(proposals.length * LOOP.LLM_PROPOSAL_PRIOR, availableMass);
            const eachProposal = proposalMass / proposals.length;
            hypotheses = scaleProbabilities(hypotheses, (availableMass - proposalMass) / priorSum);
            hypotheses.push(
                ...proposals.map((id) => ({
                    id,
                    label: id,
                    probability: eachProposal,
                    source: 'llm-proposed' as const,
                    provenance: ['llm proposal: name only, floor probability'],
                })),
            );
        }
    } else if (hypotheses.length > 0) {
        hypotheses = scaleProbabilities(hypotheses, availableMass / priorSum);
    }
    hypotheses.sort((a, b) => b.probability - a.probability || a.id.localeCompare(b.id));
    return { hypotheses, otherProbability: LOOP.OTHER_FLOOR, round: 0 };
}

// --- Logic filter ---
// A reading contradicts a hypothesis when the reading is present (or
// absent) and the rule says that state rules the hypothesis out. Under
// the single-fault assumption the survivors are exactly the hypotheses
// consistent with every reading — the minimal hitting set of the
// per-reading conflict sets, where each conflict set is the hypotheses
// that reading rules out. Multi-fault diagnoses would enumerate hitting
// sets over these conflicts instead; this loop stays single-fault.

export interface ConsistencyRule {
    id: string;
    hypothesisId: string;
    readingId: string;
    inconsistentWhen: 'present' | 'absent';
}

export interface Reading {
    id: string;
    present: boolean;
}

export interface LogicFilterResult {
    differential: Differential;
    dropped: string[];
}

/**
 * Drops hypotheses contradicted by the readings and moves their mass to
 * OTHER. Survivors keep their probabilities: they already sum to what
 * is left of 1 once the dropped mass moves, so no renormalisation is
 * needed. The dropped ids and the rules that dropped them are returned
 * so the trace can name the evidence, not the model.
 */
export function applyLogicFilter(
    differential: Differential,
    readings: ReadonlyArray<Reading>,
    rules: ReadonlyArray<ConsistencyRule>,
): LogicFilterResult {
    const readingById = new Map(readings.map((reading) => [reading.id, reading.present]));
    const dropped = new Set<string>();
    for (const rule of rules) {
        const present = readingById.get(rule.readingId);
        if (present === undefined) {
            continue;
        }
        if ((rule.inconsistentWhen === 'present' && present) || (rule.inconsistentWhen === 'absent' && !present)) {
            dropped.add(normalizeHypothesisId(rule.hypothesisId));
        }
    }
    if (dropped.size === 0) {
        return { differential, dropped: [] };
    }
    const droppedIds = [...dropped].sort();
    const survivors = differential.hypotheses.filter((hypothesis) => !dropped.has(hypothesis.id));
    const droppedMass = differential.hypotheses
        .filter((hypothesis) => dropped.has(hypothesis.id))
        .reduce((sum, hypothesis) => sum + hypothesis.probability, 0);
    return {
        differential: {
            hypotheses: survivors,
            otherProbability: Math.min(1, differential.otherProbability + droppedMass),
            round: differential.round,
        },
        dropped: droppedIds,
    };
}
