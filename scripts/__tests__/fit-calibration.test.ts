// Reliability diagram viewport (LM-37): every emitted coordinate must
// lie inside the 420x300 SVG. The vertical scale once reused the 348px
// plot width in a 300-tall viewport, putting the x-axis 84px below the
// canvas and clipping every bar at the bottom edge.
import { describe, expect, it } from 'vitest';
import { GeneratedCalibrationConfigSchema, type ResolvedCase } from '@lemonade/core';
import { reliabilitySvg } from '../fit-calibration';

const CONFIG = GeneratedCalibrationConfigSchema.parse({
    version: 1,
    fitted_at: '2026-11-01T00:00:00.000Z',
    dataset_sha256: 'test',
    split: { holdout: 'newest_20pct_by_closed_at' },
    groups: { _pooled: { method: 'identity', n_fit: 11, n_holdout: 11 } },
    other_mass: { method: 'identity' },
    thresholds: { tau_floor: 0.8, eps_safety: 0.01, other_escalate: 0.25 },
});

function resolvedCase(rawProbability: number, label: 0 | 1, index: number): ResolvedCase {
    return {
        caseId: `case-${index}`,
        suiteId: 'lemonade-bench',
        group: '_pooled',
        committedHypothesisId: 'misfire',
        trueHypothesisId: 'misfire',
        trueCauseSafetyCritical: false,
        trueCauseListed: true,
        rawProbability,
        otherProbability: 0.05,
        safetyProbability: 0.001,
        label,
        closedAt: '2026-11-01T00:00:00.000Z',
    };
}

describe('reliabilitySvg', () => {
    it('keeps every emitted coordinate inside the viewport', () => {
        // One case per bin, plus a second case in the 0.5-0.6 bin with
        // the opposite label, so the bars span observed frequencies
        // 0, 0.5, and 1.0 across the full vertical range.
        const cases = [
            resolvedCase(0.05, 0, 1),
            resolvedCase(0.15, 1, 2),
            resolvedCase(0.25, 0, 3),
            resolvedCase(0.35, 1, 4),
            resolvedCase(0.45, 0, 5),
            resolvedCase(0.52, 0, 6),
            resolvedCase(0.58, 1, 7),
            resolvedCase(0.65, 0, 8),
            resolvedCase(0.75, 1, 9),
            resolvedCase(0.85, 0, 10),
            resolvedCase(0.95, 1, 11),
        ];
        const svg = reliabilitySvg('_pooled', cases, CONFIG);
        expect(svg).toContain('width="420" height="300"');
        const xCoords = [...svg.matchAll(/(?:x|x1|x2|cx)="([\d.]+)"/g)].map((match) => Number(match[1]));
        const yCoords = [...svg.matchAll(/(?:y|y1|y2|cy)="([\d.]+)"/g)].map((match) => Number(match[1]));
        expect(xCoords.length).toBeGreaterThan(0);
        expect(yCoords.length).toBeGreaterThan(0);
        for (const x of xCoords) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(420);
        }
        for (const y of yCoords) {
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(300);
        }
        // A bar with observed frequency 1.0 spans the full plot height
        // (300 - 2*36 = 228) starting at the top padding, unclipped.
        const barHeights = [...svg.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map((match) => Number(match[1]));
        expect(Math.max(...barHeights)).toBe(228);
        expect(svg).toContain('y="36.0"');
    });
});
