# Senior-mechanic diagnostic engine: design synthesis (2026-11-11)
Sources: research/diag-products.md, specialist-agents.md, oss-diag.md, neurosymbolic-diag.md. Expert-in-the-loop idea from Dawan, after Thesis Care.

## Core loop (agentic, neurosymbolic)
Phases: intake (verify the complaint, check TSBs/recalls, rate severity) -> workup loop -> repair guidance -> verify fix -> close-out with outcome.
Workup loop each round:
1. Facts in deterministically: DTC set plus freeze frame or a fault window (60 s before to 15 s after), PIDs, Mode 06, J1939 DM1 SPN/FMI, VIN, mileage, history.
2. Hypothesis set H, plus an explicit OTHER bucket. The LLM may propose additions; it never sets numbers.
3. Prior = confirmed-fix frequency for similar vehicle/code/mileage (SureTrack-style), smoothed with KG/FMEA priors (pi(h) = (n_h + alpha*q(h))/(N + alpha)); a TSB match boosts it.
4. Logic filter: Reiter/GDE hitting sets drop inconsistent hypotheses to 0.
5. Bayes update with each test's real hit and false-alarm rates. LLM-drafted likelihoods are shrunk toward 0.5.
6. Next action = lowest expected cost to resolve (Heckerman/SACSO probability/cost ordering; cost = labor + parts + downtime + risk, depending on what's already taken apart). Fallback: information gain per dollar. Cheapest order: ask the tech, look through the glasses, measure, then swap or tear down.
7. Challenger: each round, also offer the cheapest test that could disprove the leader (anti-anchoring; experts anchor on the common cause).
8. Stop: commit when repairing now has the lowest expected cost or the calibrated top probability clears its threshold. Escalate to a human expert when OTHER > ~25%, the evidence is inconsistent, the budget runs out, or the system is safety-critical and unresolved. Closing requires a verified fix (complaint gone, code doesn't return).
9. Safety: hard preconditions per test; safety-critical faults can't be released above ~1% probability.
10. Calibrate confidence on resolved cases (never the LLM's stated confidence).

## Talker/thinker
AMIE-style: a fast voice talker and a slow reasoner share the case record (differential, plan, phase) = LM-14 + ledger LM-01. Keep only diagnostic data in context (RCACopilot, RCAgent).

## Test steps (JPRO/WrenchLane style)
Each step states location, connection, conditions, expected value, and a yes/no answer. Verify the part before ordering it.

## Expert-in-the-loop network (Thesis Care pattern)
- Tier 1 senior/master techs on call for live escalations and approvals on safety-critical or expensive repairs. Tier 2 new grads for offline grading under senior review.
- Start services-first: 2-3 contract master techs paid per case back the first shop.
- Every override or answer gets a voice debrief (Tacit-TALK) and becomes a labeled ledger event that feeds priors, the playbook (LM-23), and evals.

## Learning loop
Confirmed fix -> counts update -> priors. Expert-validated before it counts (Identifix/Bosch). Cold start: NHTSA complaints/TSBs, AutoRepairBench, mining repair-order text (Predii).

## Build stack
- TS: cantools-style decode via opendbc DBCs (port or sidecar), OBDb PIDs (CC-BY-SA, kept as a separate asset), Wal33D dtc-database (check provenance), our own hitting-set engine (+Z3), MAI-DxO pattern ported from ngoanpv/open-mai-dxo.
- Python sidecar: pgmpy/pyAgrum (influence diagrams), udsoncan for UDS 0x19 freeze frames, pretty_j1939 (Digital Annex license needed), cbrkit for case retrieval.
- GPL code stays out of shipped code (python-OBD).
- Eval: LemonadeBench = SDBench-style gatekeeper over replayable vehicle snapshots plus a labor/parts cost model, scoring accuracy, cost, and evidence-backed process. Plus AutoRepairBench and AssetOpsBench/FailureSensorIQ for heavy equipment. RL (DiagGym-style) later.

## Proposed issue changes (pending Dawan's yes)
- Rewrite LM-04 as the engine above (prior from fixes, logic filter, Bayes, cost-based next test, challenger, stop/escalate).
- New: LM-33 field-fix prior and data ingestion (NHTSA, AutoRepairBench, repair-order mining); LM-34 test library with cost, safety, and expected values; LM-35 expert-in-the-loop network and escalation; LM-36 LemonadeBench (gatekeeper sim + cost model, process scoring); LM-37 calibration on resolved cases; LM-38 vehicle knowledge graph + FMEA + J1939 DM1.
