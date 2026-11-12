# LM-37 Calibration Spec

Status: agreed with Dawan, 2026-11-12. Issue: #39. This spec replaces the earlier pointer to `research/neurosymbolic-diag.md`, which was never committed to this repo.

Grounded in the repo: the hand-tuned blend to replace lives in `DiagnosisSynthesizer`. The threshold hooks are in the shared config. The CI gate follows the existing gate shape.

## 1. Which signal to calibrate
- **Primary:** the engine's posterior `P(h_top | E)` from the LM-04 Bayes update. This is the number calibrated, and the number the stop rule reads.
- **Secondary (prior only):** for hypotheses the LLM proposes, use the vote share across k samples or the token log-probability of a categorical pick. These feed the prior. They never feed the commit decision directly.
- **Never:** the LLM's verbalized confidence. In studies its AUROC for correctness was 0.51–0.70, against 0.71–0.87 for answer-token probability.
- **OTHER mass** gets its own calibration map, because it drives escalation.
- Fit **per subsystem group**: powertrain, electrical, brakes_steering, hvac, body. Any group with fewer than 50 fit cases is pooled into `_pooled`.

## 2. What data to fit against
- **Unit:** one resolved case, scored at the moment of commit.
- **Label:** `1` if the top hypothesis at commit matched the **verified** fix, meaning the complaint is gone and the code did not return within the verify window. Otherwise `0`. Cases without a verified outcome are excluded.
- **Sources, in priority order:**
  1. LemonadeBench held-out replays (LM-36), usable now.
  2. AutoRepairBench cases. Confirm the license before ingesting.
  3. Real ledger cases with expert sign-off (LM-35). These replace 1 and 2 as they accrue, and are weighted higher when mixed.
- **Split:** by time on `closed_at`. The newest 20% is the holdout and is never used for fitting.
- **Method by sample size (per group):**
  - n ≥ 200: isotonic regression
  - 30 ≤ n < 200: Platt scaling (or temperature)
  - n < 30 pooled: identity map. Runtime results carry `uncalibrated: true`, and the conservative floors below apply unchanged.

## 3. How costs set the thresholds
- **Commit** when calibrated `P(h_top|E) ≥ τ`, where
  `τ = C_wrong_repair / (C_wrong_repair + C_next_best_test)`, floored at `tau_floor` (default **0.80**).
  `τ` is computed **per case at runtime** from LM-34 costs: labor, parts, downtime, and the current disassembly state. Only the floor lives in config.
- **Commit early** when repairing now has a lower expected cost than every remaining test (the ECR rule). The floor still applies.
- **Safety gate:** no release and no "no fault found" while `P(safety_set | E) ≥ eps_safety` (default **0.01**). The safety set is brakes, steering, HV insulation, wheel-end, and hydraulics under load.
- **Escalate** to an expert when calibrated OTHER ≥ `other_escalate` (default **0.25**), when the evidence is inconsistent, or when the budget is exhausted.
- **Fitting thresholds:** the fit script tunes `tau_floor`, `eps_safety` and `other_escalate` on the holdout to meet a wrong-repair rate of 5% or less at commit, with **zero** safety misses. The defaults are design starting points, not figures from papers.

## 4. Generated config
Path: `packages/core/src/config/calibration.generated.json`. Only the fit script writes it; never edit it by hand.

```json
{
  "version": 1,
  "fitted_at": "2026-11-20T00:00:00Z",
  "dataset_sha256": "<sha256 of the fit+holdout case set>",
  "split": { "holdout": "newest_20pct_by_closed_at" },
  "groups": {
    "powertrain": {
      "method": "isotonic",
      "n_fit": 412, "n_holdout": 103,
      "map": { "x": [0, 0.4, 0.7, 0.9, 1], "y": [0, 0.31, 0.62, 0.86, 0.97] },
      "metrics": { "ece": 0.034, "brier": 0.11, "top1": 0.81 }
    },
    "_pooled": { "method": "platt", "a": 1.7, "b": -0.6, "n_fit": 96 }
  },
  "other_mass": { "method": "platt", "a": 1.2, "b": -0.3 },
  "thresholds": {
    "tau_floor": 0.80,
    "eps_safety": 0.01,
    "other_escalate": 0.25
  }
}
```

The values shown are illustrative. Runtime loads this file through the shared config's threshold hooks. When the file is missing, use the identity map and the default thresholds, and mark results `uncalibrated: true`.

## 5. CI gate and done-when
- Holdout ECE ≤ **0.05** for each group with n_holdout ≥ 30, and for the pooled set.
- CI fails when `dataset_sha256` doesn't match the current dataset, because the fit is stale.
- Reliability diagrams and a metrics table (ECE, Brier, top-1, per group) are written to `reports/calibration/`.
- The hand-tuned blend in `DiagnosisSynthesizer` is deleted, and thresholds load only from the generated config.
- Unit tests cover the isotonic, Platt and identity fits on synthetic data with known calibration, the per-case τ computation, and the safety gate blocking release at P = 0.011.
