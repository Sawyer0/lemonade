# Case goal contract (LM-25)

A case goal is the machine-checkable definition of done for one case:
the tech-confirmed complaint, the outcome the case must reach, the criteria
that prove it, and the budget the run may spend. The contract lives in
`packages/core/src/goal/`: `goalSchema.ts` (the Zod schemas) and
`evaluateGoal.ts` (the pure evaluator plus the goal lifecycle).

## Where goals come from

Goals come from a tech-confirmed complaint and a workflow template, never
from the model. `buildGoal` takes the complaint, the template's criteria,
and the budget, and throws on a complaint the tech never confirmed
(`complaint.confirmedByTech` is a literal `true` in the schema, so an
unconfirmed complaint cannot even parse). There is no model input anywhere
in the goal path, and the model never sets goal status directly (see
`transitionGoalStatus`).

## The evaluator

`evaluateGoal(goal, ledger)` is pure and deterministic: the same goal and
ledger, in any order, always return the same per-criterion verdicts —
`met`, `unmet`, or `contradicted` — each with the ledger entries cited as
evidence. The result also reports `allMet` (every criterion) and
`blockingMet` (every blocking criterion).

Proof rules:

- **Model evidence never proves anything.** A `model`-sourced entry never
  satisfies a proof criterion (`ledger_has`,
  `pre_registered_test_passed`). The schema rejects `model` in an
  admissible list, and the evaluator enforces the exclusion independently,
  so a hand-built goal cannot be satisfied by model evidence either.
- **Corrected evidence is retracted.** An entry a later `correction`
  references no longer counts as proof.
- **`goal_set`, `goal_amended`, `criterion_met`, and `goal_status_changed`
  entries are audit, not proof, and neither is a `correction`.** A criterion
  is met only by the underlying evidence, never because the goal was set or
  amended, or because an earlier evaluation said so. Otherwise an
  evaluation could certify itself.
- **A re-test must run after the goal was set.** A
  `pre_registered_test_passed` criterion is satisfied only by a passing
  `test_result` with the pre-registered test name, from an admissible
  source, recorded after the goal's `goal_set` entry. A pass from before
  commit is not the pre-registered re-test. A `fail` for the same test
  after the goal was set marks the criterion `contradicted`. With no
  `goal_set` entry for the goal in the ledger, the criterion is `unmet`:
  a goal that was never set cannot be satisfied by a stale pass.
- **The posterior is the ledger's hypotheses.** A `posterior` check reads
  `hypothesis` entries as the belief distribution: each distinct hypothesis
  text is one hypothesis, its confidence the highest any entry gave it.
  The check passes when the top confidence clears `minTop` and the margin
  over the runner-up clears `minMargin` (with a single distinct hypothesis
  the margin is the top confidence itself, there being no runner-up). This
  is a belief check, so it reads hypotheses from any source; it is not
  proof about the world.
- **`judge` checks are never met here.** A semantic rubric needs a judge
  (LM-19), which the pure evaluator does not have. Goals with judge
  criteria stay unmet until LM-19 lands — fail-closed by design.

## Amendments and status

- `amendGoal` rejects any amendment without tech confirmation, rejects an
  amendment with no changes (an empty amendment must not consume a
  version) and one confirmed with an empty tech id, bumps the goal version
  by one, and never changes the goal or case id. A terminal goal cannot be
  amended. Record the amendment as a `goal_amended` ledger entry, whose
  payload enforces `version === previousVersion + 1` at the ledger layer.
- `transitionGoalStatus` enforces authority: `paused` is tech-only,
  `budget_limited` is system-only, and `verified_fix`,
  `diagnosed_unverified`, `abstained`, `safety_stopped`, and `escalated`
  are code-only — only the evaluator or safety code may derive them.
  `active` and `needs_tech` accept any authority (code, tech, or system:
  the harness may resume a goal). Terminal statuses never transition out.
  Moving to the current status is a no-op returning the goal unchanged,
  but the authority is still checked. Record the move as a
  `goal_status_changed` entry.
- Status changes do not bump the goal version; only tech-confirmed
  amendments do.

## Ledger kinds and storage

The goal ledger kinds are `goal_set` (carrying the full goal, so a replay
can rebuild it), `goal_amended`, `criterion_met`, and
`goal_status_changed`, all appendable through the existing
`AppendLedgerEntryInput` path. `sandbox` is a ledger evidence source: a
test run in the sandbox is deterministic, model-free evidence. Migration
`db/migrations/0003_ledger_goal_types.sql` extends the type and source
CHECKs; the repository test applies it.

## Deviations from the issue's proposed schema

- Evidence sources use the ledger's casing (`OBD`, `NHTSA`) instead of
  the proposal's lowercase, so goals and ledger entries share one
  vocabulary with no mapping layer. `sandbox` is added to the ledger
  source enum for the same reason.
- `caseId` is a UUID, matching the ledger's case ids.
- `pre_registered_test_passed` carries `testName` and `admissible`: the
  proposal had no fields, but "test id fixed at commit" is only checkable
  when the test identity and the admissible sources are in the criterion.
- `goal_set` payloads must carry a `goalId` matching the embedded goal.

## Follow-ups (not this issue)

- Wiring `buildGoal` / `evaluateGoal` into the case service and the
  mechanic machine (evaluation runs, `criterion_met` and
  `goal_status_changed` entries appended as criteria are met) — same shape
  as LM-21's wiring follow-up (#71).
- LM-19 judge: a `judge` check that can actually be met.
- LM-22 benchmark: the golden-case replay fixture in
  `packages/core/src/goal/__tests__/fixtures/goldenCase.ts` is the replay
  input for the benchmark harness.
