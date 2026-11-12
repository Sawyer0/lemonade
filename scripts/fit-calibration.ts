// Fit script (LM-37): fits the calibration maps from resolved cases and
// writes the generated config plus the reliability diagrams and metrics
// table. Only this script writes packages/core/src/config/
// calibration.generated.json; never edit that file by hand.
//
// Data source: LemonadeBench held-out replays (LM-36), the usable-now
// source in the spec. AutoRepairBench cases are NOT ingested here —
// their license must be confirmed first — and real ledger cases arrive
// later with expert sign-off (LM-35). Each replay runs the LM-04 engine
// to a commit; the resolved case is scored at that moment, with label 1
// when the top hypothesis matched the verified fix.
//
// LemonadeBench replays carry no close timestamps, so replay order
// stands in for close time: closed_at is a fixed base date plus the
// replay index in days, oldest first, and the newest 20% is the
// holdout. The dataset hash covers the case set, so any engine change
// that moves the replays makes the CI gate fail until the fit re-runs.
//
// With the current 30 replays every group is under 50 fit cases, so
// everything pools into _pooled — and with 24 fit cases that pools to
// the identity map with uncalibrated: true, exactly as the spec's
// method-by-sample-size rules require. The isotonic and Platt machinery
// is real and unit-tested; it engages when the case set grows.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    DEFAULT_TAU_FLOOR,
    ResolvedCaseSchema,
    applyCalibrationMap,
    calibrateProbability,
    canonicalDatasetJson,
    computeBrier,
    computeEce,
    computeTop1,
    fitGroupCalibration,
    reliabilityBins,
    splitByClosedAt,
    subsystemGroupForHypothesisId,
    tuneThresholds,
    type GeneratedCalibrationConfig,
    type ResolvedCase,
    type SubsystemGroup,
} from '@lemonade/core';
import { lemonadeBenchSuites, runBenchSuite } from '../evals/lemonade-bench/benchRunner';

const GENERATED_CONFIG_PATH = path.resolve(__dirname, '../packages/core/src/config/calibration.generated.json');
const REPORTS_DIR = path.resolve(__dirname, '../reports/calibration');
// Fixed base for the replay-order close-time proxy (see header).
const CLOSED_AT_BASE_MS = Date.UTC(2026, 10, 1);

function round6(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

function closedAtFor(index: number): string {
    return new Date(CLOSED_AT_BASE_MS + index * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The resolved cases: one per unique LemonadeBench replay that reached
 * a commit. Replays that escalate have no commit moment and are
 * excluded; the AutoRepairBench lens replays the same vehicle cases,
 * so it is deduplicated by case id.
 */
export function collectResolvedCases(): ResolvedCase[] {
    const seen = new Set<string>();
    const cases: ResolvedCase[] = [];
    let index = 0;
    for (const suite of lemonadeBenchSuites()) {
        const report = runBenchSuite(suite);
        for (const outcome of report.cases) {
            const caseId = `${suite.id}:${outcome.caseId}`;
            if (seen.has(outcome.caseId)) continue;
            seen.add(outcome.caseId);
            if (outcome.decisionKind !== 'repair' || outcome.committedHypothesisId === null) {
                console.log(`Skipping ${caseId}: no commit (${outcome.decisionKind}).`);
                continue;
            }
            const snapshot = suite.snapshots.find((entry) => entry.recorded.caseId === outcome.caseId);
            if (snapshot === undefined) {
                throw new Error(`LemonadeBench snapshot missing for ${outcome.caseId}`);
            }
            const parsed = ResolvedCaseSchema.parse({
                caseId,
                suiteId: suite.id,
                group: subsystemGroupForHypothesisId(outcome.committedHypothesisId),
                committedHypothesisId: outcome.committedHypothesisId,
                trueHypothesisId: snapshot.trueHypothesisId,
                trueCauseSafetyCritical: snapshot.safetyCriticalHypothesisIds.includes(snapshot.trueHypothesisId),
                trueCauseListed: outcome.finalHypothesisIds.includes(snapshot.trueHypothesisId),
                rawProbability: round6(outcome.leaderProbability),
                otherProbability: round6(outcome.otherProbability),
                safetyProbability: round6(outcome.maxSafetyProbability),
                label: outcome.autoRepairClosed ? 1 : 0,
                closedAt: closedAtFor(index),
            });
            cases.push(parsed);
            index += 1;
        }
    }
    return cases;
}

/** Groups with fewer than 50 fit cases pool into `_pooled`. */
export function poolGroups(fit: ResolvedCase[]): Map<SubsystemGroup, ResolvedCase[]> {
    const byGroup = new Map<SubsystemGroup, ResolvedCase[]>();
    for (const entry of fit) {
        const list = byGroup.get(entry.group) ?? [];
        list.push(entry);
        byGroup.set(entry.group, list);
    }
    const pooled: ResolvedCase[] = [];
    const fitted = new Map<SubsystemGroup, ResolvedCase[]>();
    for (const [group, entries] of byGroup) {
        if (group === '_pooled' || entries.length < 50) {
            pooled.push(...entries);
        } else {
            fitted.set(group, entries);
        }
    }
    if (pooled.length > 0) fitted.set('_pooled', pooled);
    return fitted;
}

/** The holdout cases a fitted group owns: its own, or every pooled-away group for `_pooled`. */
export function holdoutForGroup(
    holdout: ResolvedCase[],
    grouped: Map<SubsystemGroup, ResolvedCase[]>,
    group: SubsystemGroup,
): ResolvedCase[] {
    return holdout.filter((entry) => entry.group === group || (group === '_pooled' && !grouped.has(entry.group)));
}

interface GroupReport {
    method: string;
    nFit: number;
    nHoldout: number;
    ece: number;
    brier: number;
    top1: number;
}

/** One reliability diagram: 10-bin bars against the diagonal, as SVG. */
export function reliabilitySvg(group: string, cases: ResolvedCase[], config: GeneratedCalibrationConfig): string {
    const bins = reliabilityBins(
        cases.map((entry) => ({
            calibratedProbability: calibrateProbability(entry.rawProbability, entry.group, config).calibrated,
            label: entry.label,
        })),
    );
    const width = 420;
    const height = 300;
    const pad = 36;
    const plot = width - pad * 2;
    const scale = (value: number): number => pad + plot - value * plot;
    const bars = bins
        .map((bin, i) => {
            const x = pad + (i * plot) / 10;
            const barWidth = plot / 10 - 2;
            const barHeight = bin.observedFrequency * plot;
            const y = scale(bin.observedFrequency);
            const meanX = pad + bin.meanPredicted * plot;
            return (
                `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="#2563eb" opacity="0.7"/>` +
                (bin.n > 0 ? `<circle cx="${meanX.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#dc2626"/>` : '')
            );
        })
        .join('\n');
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="Reliability diagram for ${group}">`,
        `<line x1="${pad}" y1="${scale(0)}" x2="${pad + plot}" y2="${scale(1)}" stroke="#94a3b8" stroke-dasharray="4"/>`,
        `<line x1="${pad}" y1="${scale(0)}" x2="${pad}" y2="${scale(1)}" stroke="#334155"/>`,
        `<line x1="${pad}" y1="${scale(0)}" x2="${pad + plot}" y2="${scale(0)}" stroke="#334155"/>`,
        bars,
        `<text x="${pad}" y="${height - 8}" font-size="12" fill="#334155">calibrated probability (blue bar: observed frequency, red dot: mean predicted)</text>`,
        `<text x="8" y="${pad + 100}" font-size="12" fill="#334155" transform="rotate(-90 8 ${pad + 100})">observed frequency</text>`,
        `<text x="${pad}" y="20" font-size="14" font-weight="bold" fill="#0f172a">Reliability — ${group} (n=${cases.length})</text>`,
        '</svg>',
    ].join('\n');
}

export function runFitCalibration(): number {
    const cases = collectResolvedCases();
    if (cases.length === 0) {
        console.error('Fit: no resolved cases; nothing to fit.');
        return 1;
    }
    const datasetSha256 = createHash('sha256').update(canonicalDatasetJson(cases)).digest('hex');
    const { fit, holdout } = splitByClosedAt(cases);
    const fittedAt =
        cases
            .map((entry) => entry.closedAt)
            .sort()
            .at(-1) ?? '';

    const grouped = poolGroups(fit);
    const groups: GeneratedCalibrationConfig['groups'] = {};
    const reports: Record<string, GroupReport> = {};
    for (const [group, entries] of grouped) {
        const fitted = fitGroupCalibration(entries.map((entry) => ({ x: entry.rawProbability, label: entry.label })));
        const groupHoldout = holdoutForGroup(holdout, grouped, group);
        const scored = groupHoldout.map((entry) => ({
            calibratedProbability: applyCalibrationMap(fitted, entry.rawProbability),
            label: entry.label,
        }));
        const metrics = {
            ece: round6(computeEce(scored)),
            brier: round6(computeBrier(scored)),
            top1: round6(computeTop1(scored)),
        };
        groups[group] = { ...fitted, n_fit: entries.length, n_holdout: groupHoldout.length, metrics };
        reports[group] = { method: fitted.method, nFit: entries.length, nHoldout: groupHoldout.length, ...metrics };
        console.log(
            `Group ${group}: ${fitted.method} (n_fit ${entries.length}, n_holdout ${groupHoldout.length}, holdout ECE ${metrics.ece})`,
        );
    }

    // OTHER mass gets its own map: the label is 1 when the true cause
    // was not among the hypotheses listed at commit. The bench proposer
    // always lists the true cause, so this is degenerate today and
    // falls back to identity; it engages when unlisted causes appear.
    const otherMass = fitGroupCalibration(
        fit.map(
            (entry) =>
                ({ x: entry.otherProbability, label: entry.trueCauseListed ? 0 : 1 }) as {
                    x: number;
                    label: 0 | 1;
                },
        ),
    );

    // Thresholds: least-conservative first; the defaults stand when the
    // holdout already meets wrong-repair ≤ 5% with zero safety misses.
    const draftConfig: GeneratedCalibrationConfig = {
        version: 1,
        fitted_at: fittedAt,
        dataset_sha256: datasetSha256,
        split: { holdout: 'newest_20pct_by_closed_at' },
        groups,
        other_mass: otherMass,
        thresholds: { tau_floor: DEFAULT_TAU_FLOOR, eps_safety: 0.01, other_escalate: 0.25 },
    };
    const holdoutScored = holdout.map((entry) => ({
        calibratedProbability: calibrateProbability(entry.rawProbability, entry.group, draftConfig).calibrated,
        safetyProbability: entry.safetyProbability,
        otherProbability: entry.otherProbability,
        label: entry.label,
        trueCauseSafetyCritical: entry.trueCauseSafetyCritical,
    }));
    const tuned = tuneThresholds(holdoutScored, [
        { tauFloor: 0.8, epsSafety: 0.01, otherEscalate: 0.25 },
        { tauFloor: 0.85, epsSafety: 0.01, otherEscalate: 0.25 },
        { tauFloor: 0.9, epsSafety: 0.01, otherEscalate: 0.25 },
        { tauFloor: 0.9, epsSafety: 0.005, otherEscalate: 0.2 },
        { tauFloor: 0.95, epsSafety: 0.005, otherEscalate: 0.15 },
    ]);
    const thresholds = tuned ?? { tauFloor: 0.8, epsSafety: 0.01, otherEscalate: 0.25 };
    if (tuned === null) {
        console.log('Fit: no candidate met the holdout bar; keeping the default thresholds.');
    } else {
        console.log(
            `Fit: thresholds tuned on holdout: tau_floor ${thresholds.tauFloor}, eps_safety ${thresholds.epsSafety}, other_escalate ${thresholds.otherEscalate}.`,
        );
    }

    const config: GeneratedCalibrationConfig = {
        ...draftConfig,
        thresholds: {
            tau_floor: thresholds.tauFloor,
            eps_safety: thresholds.epsSafety,
            other_escalate: thresholds.otherEscalate,
        },
    };

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(GENERATED_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
    fs.writeFileSync(path.join(REPORTS_DIR, 'fit-cases.json'), `${JSON.stringify(cases, null, 2)}\n`);
    const pooledHoldout = holdout.map((entry) => ({
        calibratedProbability: calibrateProbability(entry.rawProbability, entry.group, config).calibrated,
        label: entry.label,
    }));
    const metricsDoc = {
        fitted_at: fittedAt,
        dataset_sha256: datasetSha256,
        n_fit: fit.length,
        n_holdout: holdout.length,
        pooled: {
            ece: round6(computeEce(pooledHoldout)),
            brier: round6(computeBrier(pooledHoldout)),
            top1: round6(computeTop1(pooledHoldout)),
        },
        groups: reports,
        thresholds: config.thresholds,
    };
    fs.writeFileSync(path.join(REPORTS_DIR, 'metrics.json'), `${JSON.stringify(metricsDoc, null, 2)}\n`);
    const rows = Object.entries(reports)
        .map(
            ([group, report]) =>
                `| ${group} | ${report.method} | ${report.nFit} | ${report.nHoldout} | ${report.ece.toFixed(3)} | ${report.brier.toFixed(3)} | ${report.top1.toFixed(3)} |`,
        )
        .join('\n');
    fs.writeFileSync(
        path.join(REPORTS_DIR, 'metrics.md'),
        [
            '# Calibration metrics (LM-37)',
            '',
            `Fitted at ${fittedAt}; dataset sha256 \`${datasetSha256}\`; holdout is the newest 20% by closed_at.`,
            `Pooled holdout ECE ${metricsDoc.pooled.ece.toFixed(3)}, Brier ${metricsDoc.pooled.brier.toFixed(3)}, top-1 ${metricsDoc.pooled.top1.toFixed(3)}.`,
            '',
            '| Group | Method | n_fit | n_holdout | ECE | Brier | Top-1 |',
            '|---|---|---|---|---|---|---|',
            rows,
            '',
        ].join('\n'),
    );
    for (const [group] of grouped) {
        fs.writeFileSync(
            path.join(REPORTS_DIR, `reliability-${group}.svg`),
            reliabilitySvg(group, holdoutForGroup(holdout, grouped, group), config),
        );
    }

    console.log(`Fit: ${cases.length} resolved cases (${fit.length} fit, ${holdout.length} holdout).`);
    console.log(`Fit: pooled holdout ECE ${metricsDoc.pooled.ece.toFixed(3)} (gate: ≤ 0.05).`);
    console.log(`Fit: wrote ${GENERATED_CONFIG_PATH} and ${REPORTS_DIR}/.`);
    return 0;
}

const invokedDirectly = process.argv[1]?.endsWith('fit-calibration.ts') ?? false;
if (invokedDirectly) {
    process.exit(runFitCalibration());
}
