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

## Drift and no-progress detection (LM-28)

`detectDrift(goal, ledger, run)` in `goal/drift.ts` flags a reasoner run
in exactly three cases, each only on a declared claim it can verify:

- the leading hypothesis explains none of the complaint's symptoms
  (from the hypothesis entry's `explainsSymptoms`, which names the
  complaint symptoms it claims to cover — a hypothesis that never declares
  coverage is unknown, not drift);
- the proposed repair matches none of the committed cause's canonical
  repair terms (LM-33 vocabulary — when either side names no known term,
  the match is unknown and no flag is raised);
- the reasoner targets a fault code unrelated to the complaint (codes
  recorded in `dtc_read` / `obd_scan` ledger entries — a complaint with no
  recorded codes cannot make a code unrelated).

`assessReasonerRun` in `goal/blocker.ts` replays one run: it detects
drift, judges progress, and records the blocker. A run made progress
when it added at least one admissible ledger entry, reusing the LM-25
proof rule — a non-audit, non-correction entry, from a non-model source,
uncorrected, whose source some criterion admits as proof. A run that
only cites its own computation therefore made no progress. A run is
blocked when it drifts or adds no admissible entry. The same blocker
three runs in a row moves the goal to `needs_tech` (code authority) and
returns the one handoff, naming the missing evidence; a different
blocker, a run that makes progress, or an amendment restarts the streak,
and a goal already at `needs_tech` (or terminal) never hands off twice.
The streak lives on the goal itself (`sameBlockerCount`, `lastBlocker`).
Replay fixtures live in
`packages/core/src/goal/__tests__/fixtures/driftCases.ts`.

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

## Held-out checks and the false verified_fix rate (LM-30)

`evaluateGoalLevel` in `goal/heldOut.ts` judges one benchmark case
twice: the visible verdict (`evaluateGoal` plus `resolveTerminalStatus`
— what the machine claims) against the hidden verdict
(`evaluateHeldOutChecks` — what the ground truth says). A case is
honestly verified only when both agree. A claimed `verified_fix` with
unmet held-out checks is a *false verified_fix*: the visible criteria
were satisfied — by gaming or by luck — while the ground truth the
reasoner never saw says the fault is not proven fixed.

Held-out checks (`HeldOutCheck`) reuse the visible criteria's check
kinds, judged by the same shared `evaluateCriteria`, so the same proof
rules apply: model evidence never proves, corrected evidence is
retracted, a re-test must run after `goal_set`. They live outside the
goal by construction — `buildGoal` takes no held-out checks, the
`CaseGoal` schema carries none, and the `goal_set` ledger payload
carries only the goal — so the reasoner, the machine, and the ledger
never see them. The benchmark runner (`evals/sdbench/goalEval.ts`)
reports the goal-satisfaction rate, the false verified_fix rate over
the shortcut set, and pass^3; the replay gate and the vitest suite
fail when the shortcut set's false verified_fix rate rises above
zero. Shortcut fixtures live in
`goal/__tests__/fixtures/shortcutCases.ts`, built on the golden-case
fixture — which closes the LM-22 follow-up below: the golden fixture
is now benchmark-harness input.

## Follow-ups (not this issue)

- Wiring `buildGoal` / `evaluateGoal` into the case service and the
  mechanic machine (evaluation runs, `criterion_met` and
  `goal_status_changed` entries appended as criteria are met) — same shape
  as LM-21's wiring follow-up (#71).
- LM-19 judge: a `judge` check that can actually be met.
