# Background evidence sub-agents (LM-18)

As soon as the VIN is decoded, child jobs run in parallel — NHTSA recalls by
component, TSBs and known failures, similar closed cases — and each returns
only a schema-validated summary. The summaries land in the case ledger as
`advisory` entries (source `research`) before the tech's first test.

## Why

Slow research shouldn't block the conversation or bloat the reasoner's
context. Each child runs in its own context (it receives only the launch
request, never the reasoner's context) and returns only its summary.

## What runs

| Child | Source | Needs |
| --- | --- | --- |
| `recall` | NHTSA recalls by vehicle, filtered by component with LM-33's segment-wise match | year, make, model |
| `tsb` | Web search (Tavily) for technical service bulletins | year, make, model |
| `known_failure` | Web search (Tavily) for common problems / known failures | year, make, model, or a symptom |
| `similar_case` | Case ledger: confirmed outcomes for the same vehicle | vehicle id |

The core fan-out is `runEvidenceChildren` (`packages/core/src/jobs/`).
The runner is `EvidenceSubagentRunner`
(`packages/infrastructure/src/services/research/`).

## Rules

- **Caps: 4 concurrent, depth 1.** The fan-out never runs more than 4
  children at once; a child never spawns children — sources receive no
  runner handle, so depth 1 holds by construction.
- **No authority.** Child output can never instruct the tech or change the
  plan. An `advisory` entry is not fact-eligible for memory writes and
  `research` is not an admissible goal source; the reasoner may read it,
  never obey it.
- **A failed lookup is `unknown`, never `none`.** A child that throws — or
  returns an invalid summary — becomes an `unknown` summary whose text says
  so, e.g. `Recall status unknown: lookup failed`. The recall child uses the
  strict NHTSA lookup (`checkRecallsStrict`), which throws on failure; the
  forgiving `checkRecalls` still returns `[]` for its existing callers.
  The TSB and known-failure children throw on search failure the same way.
- **Early launch.** Read-only lookups may start from partial speech, before
  the VIN is decoded. A child whose inputs are missing is skipped, not
  recorded as `unknown`.
- **Once per case.** A launch that filed summaries marks the case; a second
  launch files nothing. A launch that could run nothing does not mark the
  case, so a later launch with more of the vehicle known still runs.

## Trigger

Today the trigger is the OBD scan: when a scan carries a VIN and its
session belongs to a case, the obd-scan route launches the runner
fire-and-forget — slow research never blocks the scan response, and a
trigger failure never fails the scan.

## Follow-ups

- Wire the launch into vehicle onboarding (`VehicleService.onboardVehicle`
  decodes the VIN but has no case yet) once the case flow exposes a case at
  decode time, instead of only at the first OBD scan.
- There is no live TSB API in the repo: the TSB child reads the web index.
  The NHTSA TSB summaries live in offline flat files behind the LM-33
  priors; a live TSB feed would replace the search query, not the child.
