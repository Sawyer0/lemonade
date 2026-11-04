/** Per-token probabilities as returned by llama.rn when `n_probs` is set. */
export interface TokenProbabilities {
    content: string;
    probs: { tok_str: string; prob: number }[];
}

/**
 * Model confidence in a generated answer: the geometric mean of the
 * probability the model gave each token it emitted. Returns undefined when
 * the runtime reported no probabilities, so callers never see a made-up score.
 */
export function completionConfidence(tokens: TokenProbabilities[] | undefined): number | undefined {
    if (!tokens || tokens.length === 0) return undefined;

    let logSum = 0;
    for (const token of tokens) {
        const chosen = token.probs.find((p) => p.tok_str === token.content) ?? token.probs[0];
        if (!chosen || chosen.prob <= 0) return 0;
        logSum += Math.log(Math.min(chosen.prob, 1));
    }
    return Math.exp(logSum / tokens.length);
}
