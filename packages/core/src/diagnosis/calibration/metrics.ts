// Reliability metrics (LM-37): ECE, Brier score, and top-1 accuracy
// over calibrated probabilities, plus the 10-bin reliability table the
// fit script renders as diagrams. Pure and deterministic.
export interface ReliabilityBin {
    binStart: number;
    binEnd: number;
    n: number;
    meanPredicted: number;
    observedFrequency: number;
}

export interface ScoredEntry {
    calibratedProbability: number;
    label: 0 | 1;
}

/** Ten equal-width bins; the last bin includes 1.0. Empty bins report n 0. */
export function reliabilityBins(entries: ScoredEntry[], binCount = 10): ReliabilityBin[] {
    const bins: ReliabilityBin[] = [];
    for (let i = 0; i < binCount; i += 1) {
        const binStart = i / binCount;
        const binEnd = (i + 1) / binCount;
        const members = entries.filter(
            (entry) =>
                entry.calibratedProbability >= binStart &&
                (i === binCount - 1 ? entry.calibratedProbability <= binEnd : entry.calibratedProbability < binEnd),
        );
        const n = members.length;
        bins.push({
            binStart,
            binEnd,
            n,
            meanPredicted: n === 0 ? 0 : members.reduce((sum, entry) => sum + entry.calibratedProbability, 0) / n,
            observedFrequency: n === 0 ? 0 : members.reduce((sum, entry) => sum + entry.label, 0) / n,
        });
    }
    return bins;
}

/** Expected calibration error: the n-weighted mean |predicted − observed| over bins. */
export function computeEce(entries: ScoredEntry[], binCount = 10): number {
    if (entries.length === 0) return 0;
    return reliabilityBins(entries, binCount).reduce(
        (sum, bin) => sum + (bin.n / entries.length) * Math.abs(bin.meanPredicted - bin.observedFrequency),
        0,
    );
}

/** Brier score: the mean squared error of the calibrated probability. */
export function computeBrier(entries: ScoredEntry[]): number {
    if (entries.length === 0) return 0;
    return entries.reduce((sum, entry) => sum + (entry.calibratedProbability - entry.label) ** 2, 0) / entries.length;
}

/** Top-1 accuracy: the share of cases whose top hypothesis was the verified fix. */
export function computeTop1(entries: ScoredEntry[]): number {
    if (entries.length === 0) return 0;
    return entries.reduce((sum, entry) => sum + entry.label, 0) / entries.length;
}
