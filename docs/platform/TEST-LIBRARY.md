# Test library (LM-34)

The typed test library is what the planner (LM-04) reads costs and accuracies
from. One test is a definition, not a guess: target hypotheses with hit and
false-alarm rates, cost (labor minutes, tools, parts), required disassembly
state, preconditions, safety class, cost tier, and a step script.

## Where things live

- `packages/core/src/diagnosis/tests/testSchema.ts` — the zod schema. Strict
  objects: an incomplete test fails validation instead of loading half-valid.
- `packages/core/src/diagnosis/tests/testLibrary.ts` — the `TestLibrary`
  read side: lookups by hypothesis, DTC, and tier; eligibility; the planner
  query `rankCandidates`.
- `packages/core/src/diagnosis/tests/stepSpeech.ts` — renders each step script
  to plain spoken sentences for the voice agent.
- `packages/core/src/diagnosis/tests/yamlLoader.ts` — parses `data/tests/*.yaml`
  text into validated definitions. The only place YAML is parsed.
- `data/tests/*.yaml` — the seed library, one file per DTC family plus the
  first-case workflow. The seeds are the source of truth.

## Schema rules the validator enforces

- Every step needs a location, an instruction, an expected value or range, and
  a yes and a no outcome.
- `hitRate` must beat `falseAlarmRate`, and both stay in 0..1.
- A `verified` test must name the human expert who reviewed it.
- A `hazardous` test must declare at least one safety precondition and at
  least one hazard.
- An `ask` test needs no disassembly; a `tear-down` test must require some.

## Unverified entries

Every seed entry is an LLM draft: `verification: { status: unverified,
source: llm-draft }`. The library shrinks unverified rates halfway toward
0.5 (see `SHARED_CONFIG.TEST_LIBRARY.UNVERIFIED_SHRINK_FACTOR`) before the
planner sees them, so a draft can never look as discriminating as a reviewed
test with the same written numbers. A human expert review flips the status
to `verified` with `reviewedBy` set, and the shrink stops applying.

## Safety preconditions are enforced, not advisory

A test is eligible only when the vehicle is already taken apart at least as
far as the test needs and every precondition is satisfied. `safetyBlockers`
lists the unmet safety preconditions; a test with any unmet safety
precondition never appears in `eligibleTests` or `rankCandidates`.

## Planner query

`rankCandidates(hypothesisIds, state)` returns the eligible tests that speak
to any of the hypotheses, cheapest first (tier, then labor minutes), each
carrying the effective rates and costs. The planner applies its own
value-of-information math on those numbers; the library does not score.
