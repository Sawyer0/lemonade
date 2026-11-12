# Neurosymbolic diagnostic reasoner for vehicles / heavy equipment ("senior mechanic" behaviour)

Research date: 2026-11-11. Every source marked **[F]** was opened and read for this note. Sources marked **[S]** were seen only as search excerpts; treat their numbers as unverified.

---

## 1. Bottom line

Do not let the LLM decide the diagnosis. The approach the literature supports, and the one I recommend:

1. **The symbolic core owns truth and arithmetic.** It holds the vehicle knowledge graph (KG) with components, connections, DTCs, failure modes, tests and costs. A consistency checker (Reiter/GDE) rules out impossible hypotheses. A Bayesian fault model owns the probabilities. A decision-theoretic planner picks the next action by **expected cost of repair (ECR)**, using the Heckerman/Breese/SACSO/Scania line of work.
2. **The LLM is the interface and the generator of hypotheses and likelihoods.** It turns complaints, repair-order (RO) text and technician answers into KG slots. It proposes hypotheses and tests the KG lacks, which go into an explicit "other / unmodelled" bucket. It drafts likelihoods where data is missing, with a tempered weight. It writes the explanation. It never sets a posterior directly.
3. **Pick the next action with cost, not information alone.** Choose the action that minimises `C(a) + Σ_o P(o|E)·ECR(E∪o)`. Use expected information gain per dollar (BED-LLM/UoT style) only for questions and free observations, or when ECR cannot be estimated. Safety acts as a hard gate plus an asymmetric loss term.
4. **Stop when repairing now beats every test in expected cost.** Also require a calibrated confidence threshold, and escalate when the "other" mass is large. Finish with repair verification: the original complaint must be gone.

Evidence that this split pays off: wrapping an LLM in explicit differential tracking, test selection and cost stewardship (MAI-DxO) cut cost from $7,850 to $2,397 at the same accuracy (78.6% → 79.9%). A KG-driven automotive framework that "actively queries for missing information" scored 77.3% against GPT-3.5's 46.1 points lower. Both are in §4.

---

## 2. Classic methods (the symbolic and probabilistic backbone)

### 2.1 Consistency-based diagnosis (Reiter 1987; de Kleer & Williams GDE 1987)
- **How it works.** You write a system description (SD) of normal component behaviour. Each component gets an `AB(c)` (abnormal) assumption. A **conflict set** is a set of components that cannot all be healthy given the observations. **A diagnosis is a minimal hitting set of the collection of conflict sets.** That is Reiter's Theorem 4.4, quoted verbatim: "Δ ⊆ COMPONENTS is a diagnosis … iff Δ is a minimal hitting set for the collection of conflict sets". [F] https://www.cs.ru.nl/~peterl/teaching/KeR/Theorist/reiteraij87.pdf
- **GDE** adds multiple faults, minimal conflicts kept in an ATMS (assumption-based truth maintenance system), and incremental diagnosis. It picks the next measurement by **minimum expected entropy** over candidate probabilities, a one-step lookahead. The authors note this "can be computed directly from the current probabilities of the differing outcomes of the measurement". [F] https://dekleer.org/Publications/gde-2006.pdf
- **Use in the architecture.** Wherever you have structural or behavioural models (electrical circuits: power, ground, signal, CAN topology; hydraulic and fuel paths), run conflict detection. Any hypothesis that hits no conflict gets probability 0. This is the hard logic that keeps the LLM from proposing a cause that physics has already ruled out. A known limitation: the method assumes observations are correct. Model sensor and test error in the probabilistic layer instead.

### 2.2 Fault trees and FMEA
- In this design these are **knowledge sources**, not reasoners. FMEA rows give (component, failure mode, effect/symptom, detection method), which become KG edges and priors. Fault-tree cut sets map onto the hitting-set view: a minimal cut set is a sufficient set of failures.
- LLM-assisted construction is now routine:
  - Generating troubleshooting trees from FMEA: about 96.9% average coverage reported. [S] https://ieeexplore.ieee.org/document/11062049
  - FMEA Builder: foundation models "correctly generate over half of an FMEA's key content". [S] https://arxiv.org/abs/2411.05054
  - LLM→KG→R-GCN over FMEA for fault-cause identification. [S] https://arxiv.org/abs/2510.15428
- **Recommendation.** Let the LLM draft FMEA and KG edges offline, have humans review them, then version them. Do not let it generate them on the fly during a diagnosis.

### 2.3 Decision-theoretic troubleshooting (Heckerman, Breese, Rommelse 1995; Breese & Heckerman 1996)
Source: [F] https://arxiv.org/pdf/1302.3563

- **Assumptions:** single fault; one problem-defining variable; observe-then-repair; costs independent of order.
- **The ordering result.** `ECR = Σ_i (1 − Σ_{j<i} p_j)(C_i^o + p_i C_i^r)` is minimised by **ordering components by decreasing p_i / C_i^o**. This is the formal version of "cheapest likely thing first".
- **Non-base observations** (e.g. "check the headlights when the car won't crank"): `ECO(I,o) = C_o + Σ_k P(o=k|I)·ECR(I∪{o=k})`. Choose the action (repair, observation, or configuration change) with the lowest expected cost.
- **Configuration change and observe** (e.g. "print locally"): handled with *persistence networks*. In the worked example this was the best first step, with expected cost 12.98 min against 13.62 min for repair-first. In simulation, average resolution time was **13.4 min with configuration changes vs 14.4 min without**.
- **Deployment.** It shipped in the Windows 95 printing troubleshooter and was also applied to automobile startup, copier feeders and gas turbines.
- **Repair probability after a fix.** Under causal independence (noisy-OR), `P(e_post = normal | repair(c_i)) ≈ P(e'_i abnormal | e abnormal)`, so you do not need to copy the network.
- **Mechanic analogues.** A swap test, jumping a relay, or unplugging a sensor to force a default value are all "configuration changes". Model them as such.

### 2.4 SACSO (HP + Aalborg) and its generalisations
- **Efficiency rule:** `ef(A|ε) = P(R(A)=ok | ε) / C_A`, a generalised Vesely-Fussell component importance scaled by cost. It extends to imperfect repairs and to "questions", meaning information-only steps. When the assumptions break, use it with lookahead. [F] https://folk.idi.ntnu.no/helgel/papers/LangsethJensenRESS03.pdf
- **SACSO methodology.** General troubleshooting is NP-complete, but greedy is optimal under assumptions weaker than Heckerman's. HP printing did not meet them, so they used heuristics. [S] https://www.cambridge.org/core/journals/ai-edam/article/abs/sacso-methodology-for-troubleshooting-complex-systems/0BF3BED81412084551E0554187EF5F62
- **Productised** as Dezide Advisor. [S] http://www.ercim.eu/publication/Ercim_News/enw56/skaaning.html
- **Cost clusters.** Ottosen & Jensen (UAI 2010) handle the case where you must disassemble something to reach a group of actions. That is exactly the heavy-equipment case. [S] https://event.cwi.nl/uai2010/papers/UAI2010_0174.pdf

### 2.5 Bayesian networks for trucks (Scania / Linköping)
- **Warnquist's PhD thesis (2015, Scania).**
  - Diagnosis uses Bayesian networks for both the workshop and remote cases. The planner minimises expected cost to restore the vehicle.
  - Evaluated on an auxiliary braking system (retarder), the XPI fuel injection system, and the engine temperature control and monitoring system.
  - Its worked example (inject 90 / pump 40 / rail-pressure check 10; prior 75/25) shows the one-step heuristic scores: replace injectors ≈108.1 vs replace pump ≈115.6.
  - [F] https://www.ida.liu.se/divisions/aiics/publications/Thesis-2015-Troubleshooting-Trucks-Automated.pdf
- **Related work (not opened):**
  - Event-driven non-stationary dynamic BNs, needed when remote and workshop sessions stretch over weeks. [S] https://www.tandfonline.com/doi/full/10.1080/08839514.2016.1156955
  - Iterative Bounding LAO* planner. [S] licentiate thesis: https://www.ida.liu.se/divisions/aiics/publications/Thesis-2011-Computer-Assisted-Troubleshooting.pdf
  - Integrated remote + workshop troubleshooting (SAE 2014-01-0284). [S]
  - Pernestål's thesis on probabilistic fault diagnosis for automotive. [S] https://liu.diva-portal.org/smash/get/diva2:278142/FULLTEXT02.pdf
- **Practical lessons from that line of work:**
  - Model disassembly state, because action cost depends on what is already apart.
  - "Verify the system is fault-free" is itself uncertain.
  - Separate the planner from the diagnoser.
- **Gaps.** I did not find (or open) a Volvo or Daimler BN paper in this pass. The only Volvo item found was an LLM/RAG chatbot over Volvo workshop records [S] https://www.diva-portal.org/smash/get/diva2:1973935/FULLTEXT02.pdf

### 2.6 Case-based reasoning from repair orders
- **Decision-theoretic CBR** (Breese & Heckerman): a Bayesian-network database of past cases with Dirichlet-assessed strengths. Extract the relevant subnetwork per session. Update the Dirichlet counts as cases resolve. [S] https://proceedings.mlr.press/r0/breese95a/breese95a.pdf; the MSR page with the abstract was a search result: https://www.microsoft.com/en-us/research/publication/decision-theoretic-troubleshooting
- **This is the right way to learn known-failure priors from ROs:** counts per (platform, engine, mileage band, DTC set) → Dirichlet posterior.
- **Modern RO and warranty mining:**
  - LoRA-fine-tuned LLMs on millions of warranty claims produce corrective-action recommendations. **About 80% of evaluated cases were near-identical to the ground-truth corrective action**, beating general-purpose and prompted LLMs. [F] https://arxiv.org/abs/2602.16836
  - GM's ontology-based mining of repair verbatims (part / symptom / action). [S] patent US20120011073A1

---

## 3. How senior technicians actually reason

- **The OEM process (GM "Strategy Based Diagnosis"):**
  1. Understand and verify the customer's concern.
  2. Verify the vehicle is operating as designed.
  3. Preliminary checks: visual inspection, record all DTCs, service history.
  4. Diagnostic system check.
  5. **Check bulletins, recalls and Preliminary Information.**
  6. Follow DTC or symptom diagnostics, or, with no published path, "develop a plan" from schematics (power, ground, input, output, splices).
  7. Isolate the root cause, repair, verify.
  8. **Re-examine the concern if it cannot be isolated**, since it could be intermittent or normal.

  The bulletin also says: "The first step … should always be: Understand and Verify … The final step … Repair Verification." [F] https://static.nhtsa.gov/odi/tsbs/2019/MC-10154625-9999.pdf
- **Search strategies (Johnson 1995):** trial and error, exhaustive, topographic, **half-split**, and functional. Most troubleshooters rely on one or two favourites. Experts seek information through technical means (instruments) more than novices, who lean on their senses. [F] https://files.eric.ed.gov/fulltext/ED389948.pdf
- **Pattern matching and its failure mode (Besnard & Cacitti 2001):**
  - Setup: 8 expert and 8 novice mechanics, a running engine, and a rare fault (intake runner for cylinder 4 obstructed).
  - Experts used fewer operations (10.7 vs 17.3, p=.015) and pulled a plug lead immediately (0 vs 3.6 prior operations, p=.044). Their frequency-based heuristic is "cheap, most-probable test first".
  - **But only 2 of 8 experts and 0 of 8 novices found the atypical fault.** The heuristic is "rigid and may lead the operator to not locate the fault if the latter is atypical."
  - The two experts who succeeded had dropped the frequency-based hypothesis set and noticed a discordant cue: seal colour.
  - Experts also *pre-rejected* hypotheses by mental simulation, e.g. "carburettor can't be it, the other 3 cylinders work".
  - [F] https://hal.science/hal-00722885v1/file/Besnard-Cacitti-2001--Troubleshooting-mechanics-heuristic.pdf
- **What this means for the design:**
  - Strong priors from known failures and TSBs give speed.
  - Consistency checking supplies the "other cylinders work, so it isn't shared" reasoning.
  - An explicit unmodelled-cause bucket plus a challenger step supplies the escape from anchoring that most experts lacked.

---

## 4. 2023–2026 LLM + symbolic work

| Work | What it does | Key number | Src |
|---|---|---|---|
| Lin & Miao, *Electronics* 2025 (German OEM, China HQ) | KG of 91 fault phenomena, 335 repair solutions and 65 rare faults, built from about 130k technician dialogues (≈60k after cleaning). Slot-filling belief state. LLM **actively asks for missing high-priority slots**. Routes to KG mode for common faults and LLM+case-retrieval mode for rare ones. | **77.3% diagnosis accuracy, +46.1 vs GPT-3.5, >14 pts over other frameworks**. No confidence output (listed as future work). Failure modes: slot misfill, KG coverage gaps, dialect. | [F] https://www.mdpi.com/2079-9292/14/21/4180 |
| MAI-DxO (Microsoft, 2025; Science Oct 2026) | One LLM plays five roles: Hypothesis (Bayesian-updated top-3), Test-Chooser (most discriminating), Challenger (anti-anchoring), Stewardship (cost veto), Checklist. Diagnoses when "certainty exceeds threshold". Optional budget tracker. | Physicians 19.9% at $2,963. o3 alone 78.6% at $7,850. **MAI-DxO 79.9% at $2,397**; 81.9% at $4,735 with no budget; 85.5% in ensemble. Single-test vs batched: same 83.9% accuracy, $3,991 vs $5,084. | [F] https://arxiv.org/html/2506.22405v2 |
| UoT, NeurIPS 2024 | LLM simulates possible answers. Reward is expected information gain. Questions chosen by reward propagation. Tested on medical diagnosis, **troubleshooting** and 20Q. | **+38.1% average success rate** vs direct prompting, with fewer questions | [F] https://arxiv.org/abs/2402.03271 |
| BED-LLM, ICLR 2026 | Sequential Bayesian experimental design. Samples candidate hypotheses from the LLM, **rejects any inconsistent with the history**, uses a uniform prior over survivors and LLM likelihoods p(y given θ,x), and maximises EIG. Key finding: a prior-likelihood factorisation beats in-context belief updating, and it is better to measure uncertainty in answer space. | **+37.4 pts success rate on 20Q** vs direct prompting, and never worse | [F] https://arxiv.org/html/2508.21184 |
| Graph RAG for automobile failure analysis (2024) | Graph RAG pipeline tuned to an existing automotive failure KG | ROUGE F1 +157.6% vs baseline Graph RAG | [F] https://arxiv.org/abs/2411.19539 |
| Warranty-claim LoRA LLM (2026) | Corrective action generated from claim narratives | about 80% near-identical to ground truth | [F] https://arxiv.org/abs/2602.16836 |
| Chain of Physics (Nov 2026) | LLM diagnosis over a Constrained KG auto-built from asset documentation | n/a (not opened) | [S] https://arxiv.org/abs/2611.14263 |
| BiCarFormer (2026) | Multimodal transformer: DTC sequences plus environmental data → error patterns | n/a | [S] https://arxiv.org/abs/2602.01109 |
| autowerkstatt4null (2026) | Federated AI off-board diagnostics for independent workshops | n/a | [S] https://arxiv.org/abs/2608.26911 |
| ASIG (2026) | Amortises BED into the LLM policy via GRPO with an EIG reward | >2× 20Q success for a 7B model, >25× cheaper than BED-LLM | [S] https://arxiv.org/abs/2607.03426 |
| KG + LLM in aviation, CNC and rail | Many papers (KG-RAG for fault QA). Mostly retrieval accuracy, with no decision theory. | — | [S] e.g. https://www.sciencedirect.com/science/article/pii/S0950705125018933 |

**What the LLM papers mostly lack:** cost-of-test reasoning (MAI-DxO is the exception), calibrated posteriors, and safety gating. That gap is where this system can differentiate.

### Calibration of LLM confidence
- **Bentegeac et al., JMIR 2025** (9 LLMs, 2,522 MedQA items):
  - Verbalized confidence sat at 90–100 regardless of correctness. **AUROC was 0.51–0.70** for predicting correctness.
  - **Answer-token probability scored AUROC 0.71–0.87** (GPT-4o 0.87) and gave lower Brier scores.
  - Shannon entropy over answer tokens performed about as well as token probability.
  - All models leaned overconfident.
  - [F] https://www.jmir.org/2025/1/e64348/
- **Other findings (not opened):**
  - Sample-consistency proxies discriminate best (ROC AUC 0.68–0.79) but are poorly calibrated. [S] Savage et al., JAMIA 2025
  - Post-hoc isotonic regression or histogram binning cuts calibration error to low single digits. [S] https://pmc.ncbi.nlm.nih.gov/articles/PMC12249208/
  - 48 LLMs on gastroenterology questions: only 5 better than random on calibration. [S] https://www.nature.com/articles/s44355-026-00053-3
- **Implication.** Never use the LLM's stated confidence. Turn LLM output into categorical choices, read log-probabilities or vote frequencies, then recalibrate (Platt or isotonic) against resolved ROs.

---

## 5. Recommended architecture

### 5.1 Components
```
            ┌──────────── LLM layer (neural) ─────────────┐
 complaint, │ parse → KG slots (symptom, conditions, DTCs) │
 RO text,   │ propose hypotheses H_llm (+ "other")         │
 tech notes │ draft P(outcome|h) where KG has none         │
            │ draft test procedures / explanations          │
            └───────────────┬──────────────────────────────┘
                            │ (structured, typed, tempered)
┌──────────── Symbolic / probabilistic core ──────────────────────────┐
│ Vehicle KG: components, topology (power/gnd/signal/CAN/fluid),      │
│   DTC→monitor enabling criteria→suspect set, FMEA modes, TSB/recall │
│   index by VIN/build, test library {cost, time, tools, disassembly  │
│   state, preconditions, safety class, sensitivity/specificity}      │
│ Consistency engine: conflicts → minimal hitting sets (GDE/Reiter)   │
│ Fault model: BN / noisy-OR over fault modes, priors from RO counts  │
│ Planner: ECR one-step lookahead (+ cost clusters / disassembly)     │
│ Safety gate + stop rule + audit log                                 │
└─────────────────────────────────────────────────────────────────────┘
```
**Symbolic parts:**
- KG
- Consistency check
- Test preconditions and safety rules
- Cost model
- Planner
- Bayesian update
- Stop rule

**Neural parts:**
- Text understanding and slot filling
- Open-world hypothesis proposal
- Missing-likelihood drafting
- Embedding retrieval of similar ROs (CBR)
- Explanation

**Learned statistically (not LLM):**
- Priors and test reliabilities from RO, warranty and comeback data
- Calibration maps

### 5.2 Hypothesis space
- `H = {single fault modes} ∪ {pairs that appear as minimal hitting sets} ∪ {h_other}`.
- Keep `h_other` (a leak node) with a prior of about 2–5%, tuned on held-out ROs. LLM proposals that are not in the KG live here until they are confirmed, at which point they are promoted into the KG.

### 5.3 Update maths
For evidence `E = {e_1..e_n}`, which covers complaint slots, DTCs, freeze-frame values and test outcomes:

1. **Prior.**
   - Base: `π(h) = (n_h + α·q(h)) / (N + α)`, where
     - `n_h` = confirmed repairs of `h` among similar vehicles (platform, engine, mileage band, region, DTC set),
     - `q(h)` = KG/FMEA base rate, or a tempered LLM proposal `q_LLM(h)^λ` normalised, with λ ≈ 0.3–0.5 fitted on validation,
     - `α` = Dirichlet strength (the Breese/Heckerman CBR approach).
   - **TSB/recall match** multiplies the prior by a likelihood ratio estimated from history, e.g. `P(TSB applies | symptom match)`.
2. **Hard filter.** `P(h|E) = 0` if `h` fails to hit every current conflict set (Reiter/GDE), or contradicts a deterministic rule such as a DTC monitor's enabling criteria.
3. **Likelihood.**
   - `P(h|E) ∝ π(h) · ∏_i P(e_i | h)`.
   - Each test carries sensitivity and specificity: `P(fail | h ∈ scope) = s`, `P(fail | h ∉ scope) = 1 − sp`. Mechanics' tests are not perfect (Besnard's misread plugs; "fault-free" is hard to verify per Pernestål and Warnquist).
   - Where the KG has no likelihood, use LLM-drafted `p_LLM(e|h)` shrunk toward 0.5: `p = w·p_LLM + (1−w)·0.5`, with w fitted on validation.
   - This is BED-LLM's lesson: use the LLM for p(answer | hypothesis), and let explicit Bayes, not in-context learning, do the updating.
4. **After a repair** with the symptom persisting: `P(h_repaired) ← P(h)·(1 − r_h)`, where `r_h` is the repair-success rate (imperfect repair per Langseth & Jensen). Renormalise.
5. **Intermittents / remote telematics.** Use a time-sliced or event-driven DBN (Pernestål/Warnquist) rather than a static BN when the session spans days.

### 5.4 Next-action rule (cost and safety)
For every admissible action `a` (question, observation/test, configuration change, or repair) in the current disassembly state `s`:

```
Q(a) = C(a, s) + Σ_o P(o | E) · ECR_greedy(E ∪ {o}, s')
C(a,s) = labour_time(a,s)·rate + parts(a) + tool/setup + downtime(a)·$/h + κ·risk(a)
ECR_greedy = Heckerman/SACSO sequence ordered by P(R(A)=ok|E)/C_A   (efficiency)
```

- **Pick** `a* = argmin Q(a)`.
- **Tie-break or fallback** when likelihoods are unreliable: maximise `EIG(a)/C(a)`. That is BED/UoT for questions and GDE's minimum-entropy measurement.
- **Question shaping.** Questions to the driver or technician cost about $0 but carry low reliability. Ask them first when EIG is high; this is MAI-DxO's "Stewardship: can a question get the same information cheaper?"
- **Half-split falls out automatically.** On a series chain with uniform priors, the midpoint measurement maximises EIG.
- **"Check basics / TSB first" falls out of p/C.** Cheap, high-prior checks rank first. Also hard-code GM step 1 (verify the complaint) and step 5 (TSBs and recalls) as mandatory preconditions, not optional actions.
- **Safety:**
  1. **Hard gates.** An action is admissible only if its preconditions hold: high-voltage isolation verified, vehicle supported, pressure relieved, lock-out/tag-out on heavy equipment. Never output an action that defeats a safety system.
  2. **Asymmetric loss.** For a safety-critical hypothesis set `S` (brakes, steering, HV insulation, wheel-end, hydraulics under load), add `L_safety·P(S|E)` to the cost of releasing the vehicle. The planner must reduce `P(S|E)` below `ε_S` (e.g. 1%) before a "no fault found / release" outcome, even if that costs more.
  3. **Escalation.** Any action whose risk exceeds the technician's certification is routed to a qualified person or the OEM technical assistance centre (TAC).
- **Batching.** MAI-DxO found single-test mode cheaper ($3,991 vs $5,084 at equal accuracy). Batch only when setup cost is shared, e.g. the vehicle is already on the lift or a panel is already off. This is the cost-cluster model.

### 5.5 Stop rule
Commit to a repair when either of these holds:
- **(a) Decision-theoretic:** the best plan's first step is a repair, i.e. `ECR(repair-first) ≤ min_a Q(a)` for every observation `a` (Heckerman). **Or**
- **(b) Confidence:** the calibrated `P(h_top|E) ≥ τ`, with τ set from the cost ratio, e.g. `τ = C_wrong_repair / (C_wrong_repair + C_next_best_test)`, floored at about 0.8. Also require `P(S|E) < ε_S` for safety-critical alternatives.

Escalate or hand to a human/TAC when:
- `P(h_other|E) > 0.25`, or
- conflicts have no consistent explanation, or
- the cost budget is exceeded, or
- the complaint cannot be verified (GM step 8: re-examine; it may be intermittent or normal operation).

After every repair, run a **verification test** that the original complaint is gone (GM's final step). Log the outcome back into the RO counts. Comebacks count as negative evidence for the repair performed.

### 5.6 Anti-anchoring (the Besnard failure)
- **Challenger step every round** (MAI-DxO): the LLM is asked for the strongest *disconfirming* test for `h_top` and for any cue the current top hypotheses do not explain. A cue no top-k hypothesis explains raises `h_other` and triggers an LLM-plus-KG search for structural explanations at a higher level of abstraction, e.g. "a cylinder needs air, fuel, spark and compression".
- **Consistency engine** does the expert's "other three cylinders run, so it's not shared" pre-rejection automatically.

### 5.7 Calibration loop
- Use LLM outputs only as categorical votes or log-probabilities, never as stated percentages.
- Calibrate the *system* posterior with isotonic regression or Platt scaling against resolved ROs, per subsystem (pooled metrics hide large differences between domains).
- Track Brier score, ECE, top-k accuracy, first-time-fix rate, cost per diagnosis, number of steps, and comeback rate.

### 5.8 Evaluation harness
Build an SDBench-style simulator. A "gatekeeper" model holds a real RO and its ground truth, and reveals test results only when they are explicitly requested. Missing results are synthesised consistently; SDBench's physicians found only 8 of 508 gatekeeper responses problematic. Score accuracy against cost on held-out recent ROs, as MAI-DxO did with its post-cutoff test set.

---

## 6. Key numbers cheat-sheet
- **Heckerman:** p/C ordering is optimal under single-fault assumptions. Configuration-change planner: 13.4 vs 14.4 min average resolution. [F]
- **MAI-DxO:**
  - o3 alone: 78.6% at $7,850
  - Budgeted: 79.9% at $2,397
  - No budget: 81.9% at $4,735
  - Ensemble: 85.5% at $7,184
  - Physicians: 19.9% at $2,963
  - [F]
- **UoT:** +38.1% success. **BED-LLM:** +37.4 pts. [F]
- **Automotive KG+LLM (OEM data):** 77.3% accuracy (+46.1 vs GPT-3.5). [F]
- **Warranty LoRA:** about 80% near-exact corrective action. [F]
- **LLM calibration:** verbalized AUROC 0.51–0.70 vs token-probability 0.71–0.87. [F]
- **Expert mechanics on a rare fault:** 2/8 solved; experts used 10.7 vs 17.3 operations. [F]

## 7. Open gaps / not verified
- No Volvo or Daimler Bayesian-network troubleshooting paper was opened. Scania/Linköping is the verified truck line.
- Chain of Physics, BiCarFormer, autowerkstatt4null, ASIG, the SACSO AI-EDAM paper, the Ottosen cost-clusters paper and the FMEA→troubleshooting-tree 96.9% figure were seen only as search excerpts.
- Thresholds in §5 (λ, w, α, the ε_S of about 1%, the τ floor of about 0.8, the 0.25 "other" escalation) are **my design suggestions, not numbers from papers**. Fit them on held-out RO data.
