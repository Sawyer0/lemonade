# Domain-specialized diagnostic agents (2024–2026): architecture to borrow for Lemonade

Compiled 2026-11-11. Scope: how teams engineer agents that diagnose under uncertainty like a senior expert. Covers medical (MAI-DxO/SDBench, AMIE, MedGemma, DiagGym, MedAction), industrial/maintenance (IBM Maximo/AssetOpsBench, Siemens, GE Vernova, Honeywell, Hitachi, AWS/KONE, aviation MRO), IT/SRE root-cause agents (RCACopilot, RCAgent, AIOpsLab, Cloud-OpsBench), and expert-capture/apprenticeship work (CTA, think-aloud, Tacit-TALK, Plant Memory, KUPAS MASTER, TrainAR).

Every claim below comes from a page that was opened (URLs at each section and in the source list). Dates are the publication/revision dates on the page. Vendor numbers are vendor claims and are labeled so.

---

## 0. TL;DR: the transferable architecture (for a mechanic that has to think like a senior tech)

1. **Separate the "talker" from the "thinker" and share one explicit case state.** AMIE splits a fast, empathetic Dialogue Agent from a slow Management agent; both read/write a structured agent state (patient summary, current differential, current plan, visit number) updated by an asynchronous background routine (arXiv 2503.06074, 2025-03-08). For voice/glasses this is the core pattern: the voice loop stays sub-second while a background reasoner keeps the differential and next-test plan current.
2. **Keep a ranked differential as a first-class object, and update it after every finding.** MAI-DxO's "Dr. Hypothesis" holds a probability-ranked top-3 differential updated "in a Bayesian manner after each new finding" (arXiv 2506.22405, 2025-06/07). MedAction scores whether hypotheses converge and whether belief updates are driven by evidence (DTC and RAC metrics, arXiv 2605.07305, v2 2026-10-22).
3. **Choose the next test by discrimination per unit cost, with an explicit cost model.** MAI-DxO's "Dr. Test-Chooser" picks up to 3 tests per round that "maximally discriminate between leading hypotheses"; "Dr. Stewardship" vetoes low-yield expensive tests and forces "could we learn this cheaper, e.g. by asking?" A budget tracker estimates cumulative cost before ordering. For Lemonade the cost axes are minutes of labor, parts/teardown invasiveness, tool availability, and safety risk. Cheapest-first evidence is *asking the operator* and *visual inspection through the glasses*.
4. **Build in an adversary against anchoring.** MAI-DxO's "Dr. Challenger" proposes tests that could falsify the leading diagnosis; the paper attributes path-switching away from wrong first impressions to this role. A "Dr. Checklist" does silent QC (valid test names, internal consistency).
5. **Make "commit" an explicit action with a threshold.** MAI-DxO's three actions per round are ask / test / commit (commit "if certainty exceeds threshold"). AMIE has a decision module that judges whether information is sufficient to transition phases. RCAgent uses a `finalize` tool as the only exit. DiagGym trains the stop decision with a turn penalty (limit 12).
6. **Use phases, not one long chat.** AMIE (multimodal, 2025-05; Nature Medicine 2026-05) runs History-taking, then Diagnosis & Management, then Follow-up, with transitions triggered by internal-state checks and questions "directed by uncertainty". Lemonade's equivalent: Intake (complaint, codes, history) → Workup (tests, inspections) → Repair guidance → Verify fix & close-out.
7. **Encode the senior tech's process as callable "handlers"/skills, not just documents.** RCACopilot (Microsoft) has engineers author per-alert-type "incident handlers", workflows of reusable actions encoding their expertise; that collection layer has run at Microsoft for 4+ years across 30 teams (arXiv 2305.15778, v4 2023-11-13). Hitachi encodes expert analysis as a STAMP/CAST method plus a knowledge graph of the equipment drawings and reports cause accuracy going from 67% (general AI) to over 90% with Daikin (Hitachi R&D, 2026-05-21). Cloud-OpsBench finds SOP prompting and past trajectories as in-context examples lift both accuracy and evidence grounding (arXiv 2603.00468, v2 2026-08-22).
8. **Less but better context beats more.** RCACopilot found diagnostic info alone beat mixing in other fields: "an excess of information can negatively impact the LLM's prediction". RCAgent hides long tool outputs behind snapshot keys in a key-value store (OBSK). AIOpsLab names "overloaded information when consuming data" as a top failure.
9. **Ground in four knowledge sources and keep a closed-loop case library.** GE Vernova's prescriptive layer draws on (1) asset manuals, (2) technical references/specs, (3) case history of past resolutions, (4) SME knowledge "that would otherwise exist only in someone's head"; engineers thumbs-up/down each recommendation at case close and the feedback flows back into the KB (GE Vernova blog, dated Oct 28, 2026 on page). IBM Maximo Condition Insight reasons over work orders, time series, meter readings, FMEA and alerts (IBM, 2025-12-05).
10. **Capture expertise continuously, by voice, with gap-targeted questions.** Tacit-TALK (2026-09-07): speech-based AI-guided conversation, one question at a time, follow-ups chosen by conversation state and knowledge gaps, graceful termination; stored in a knowledge graph. Plant Memory (arXiv 2610.19131, 2026-10-13): every extracted fact carries confidence, evidence, verification state; techs answer "targeted knowledge-gap questions where failures repeat without a recorded cause"; served to agents via MCP.
11. **Evaluate in a sim with a gatekeeper and score process, not only the answer.** SDBench's gatekeeper reveals only what's asked and synthesizes plausible results for unrecorded tests so absence isn't a clue; a judge scores 1–5; cost is tallied (Science, 2026-10-22; github.com/microsoft/sdbench). Cloud-OpsBench shows the trap: best Joint RCA accuracy 0.76/0.68 but Evidence Closure Rate only 0.38/0.15, so right answers often aren't backed by the evidence. Lemonade needs a "VehicleBench": replayable cases with a gatekeeper, a labor/parts cost model, and process metrics.
12. **Interactive RL beats static fine-tuning for the "what next / when to stop" policy, once you have a simulator.** DiagGym/DiagAgent: +11.20% diagnostic accuracy and +17.58% exam-recommendation F1 over 11 SOTA LLMs, from multi-turn RL in an EHR-trained world model (arXiv 2510.24654, v2 2026-02-10). MedAction warns that similarity-based dense rewards "are easily hacked".

---

## 1. Medical diagnostic agents

### 1.1 Microsoft MAI-DxO / DxO + SDBench (sequential diagnosis with gatekeeper and cost)
Sources: arXiv 2506.22405 (v1 2025-06-27, v2 2025-07-02) https://arxiv.org/abs/2506.22405 (HTML read); *Science* 394:423–428, published 2026-10-22, https://www.science.org/doi/10.1126/science.aeh7930; repo https://github.com/microsoft/sdbench.

- **Loop.** Agent starts from a short, non-revealing case abstract. Each turn it does one of three things: ask questions, order tests, or commit a diagnosis. A **Gatekeeper** LLM (o4-mini in the preprint) holds the full case and answers only explicit queries. For tests not in the record it returns realistic synthetic, case-consistent results "to avoid signaling the absence of data". A **Judge** scores the final diagnosis on a 5-level physician-authored rubric (4–5 = correct, i.e. management unchanged). A **Cost Estimator** maps free-text tests to CPT codes and prices them from a hospital chargemaster; each "visit" (block of questions) costs $300 (preprint).
- **Orchestrator (virtual panel), from the preprint:**
  - *Dr. Hypothesis*: probability-ranked top-3 differential, Bayesian-style update after each finding.
  - *Dr. Test-Chooser*: up to 3 tests per round that maximally discriminate between the leading hypotheses.
  - *Dr. Challenger*: devil's advocate. Flags anchoring and contradictory evidence, and proposes falsifying tests.
  - *Dr. Stewardship*: cheaper equivalent alternatives, vetoes low-yield expensive tests.
  - *Dr. Checklist*: silent QC (valid test names, consistency).
  - "Chain of Debate" reaches consensus on ask / test / commit (commit if certainty exceeds threshold). An optional budget tracker estimates cumulative and per-test cost before ordering.
  - Operating modes: Instant Answer, Question-Only, Budgeted (can cancel tests after seeing estimated cost), No-Budget, Ensemble (parallel panels plus an aggregator panel).
- **How next action is chosen.** Discrimination between top hypotheses × cost, with a stewardship veto. The authors say baseline o3 "lacked a theory of information value", ordering "reasonable" tests rather than what "maximally reduced diagnostic uncertainty per dollar".
- **Results (preprint, o3, 304 NEJM CPC cases).** 80% accuracy vs 20% for generalist physicians; 85.5% max-accuracy config; o3 alone 78.6% at $7,850 vs MAI-DxO 79.9% at $2,397. Gains generalized across OpenAI, Gemini, Claude, Grok, DeepSeek, and Llama models. A 56-case 2024–25 test set was hidden from developers.
- **Results (Science 2026, GPT-5, adds 325 MIMIC-IV-ED cases).** CPC: 83.2% at $5,431 (no budget); 80.9% at $2,241; 79.6% at $1,303; 84.5% at $8,945. Physicians: 22.3% closed-book, 36.1% open-book. ED: 80.3% at $4,979 vs physicians 46.8%. Orchestration added an average of +7.9 points (CPC) and +4.4 points (ED) across models. Re-run with GPT-5.5 with no prompt changes: the advantage over baseline *increased*.
- **Behavioral finding worth copying.** DxO asked a mean of 25.5 questions before its first test; physicians asked 5.6. The advantage concentrated in cases needing better history-taking (rare exposures, travel). For a mechanic: interview the operator thoroughly ("when does it happen, cold or hot, after what work, what changed") before pulling parts.
- **Error profile.** DxO errors were usually "clinically adjacent" at the wrong specificity. A Science eLetter (2026-10-22) warns that near-miss errors can persist across repeated encounters and asks for longitudinal endpoints (persistence of wrong diagnoses, time to correction).
- **Limits (authors).** Text-only oracle, no noise or omissions from patients, no multimodal data, cost proxy ignores time-to-result and invasiveness.
- **Open replications.** Open-MAI-Dx-Orchestrator (Swarms) and a LangGraph port exist (seen in search; not opened). MIMIC-IV-Ext-SDBench is on PhysioNet.

### 1.2 Google AMIE (diagnostic dialogue, multi-visit management, state-aware multimodal)
Sources: *Nature* "Towards conversational diagnostic AI", published 2025-04-09, https://www.nature.com/articles/s41586-025-08866-7; arXiv 2503.06074 "Towards Conversational AI for Disease Management", 2025-03-08, https://arxiv.org/abs/2503.06074; arXiv 2505.04653 "Advancing Conversational Diagnostic AI with Multimodal Reasoning", 2025-05-06 (Nature Medicine 2026-05-14), https://arxiv.org/html/2505.04653; Google Research blog 2025-05-01, https://research.google/blog/amie-gains-vision-a-research-ai-agent-for-multi-modal-diagnostic-dialogue/.

- **Training (Nature 2025).** Self-play simulated environment with an inner loop (in-context critic feedback refines dialogues with an AI patient agent) and an outer loop (refined dialogues go back into fine-tuning), plus an inference-time chain-of-reasoning. Evaluated in a randomized double-blind OSCE with 159 scenarios against PCPs.
- **Multi-visit management (2503.06074).** Two agents:
  - *Dialogue Agent*: fast, intuitive, empathetic, keeps persistent state across visits.
  - *Mx Agent*: slow, heavy inference over clinical guidelines. Coarse retrieval narrows 627 guideline docs (10.5M tokens) via Gecko embeddings over generated abstracts; the agent issues up to 5 queries and uses about 256k tokens (~6 docs) in context. Uses decoding-constrained JSON so plans carry valid citations.
  - **Agent state** shared by both and updated asynchronously: current patient summary, current differential, current management plan (investigations now, after the visit, and actions), plus attributes like visit number that switch prompts for initial vs follow-up visits.
  - Results: in a 100-scenario multi-visit OSCE vs 21 PCPs, non-inferior on management, better on precision and guideline grounding. RxQA medication benchmark: AMIE beat PCPs on harder questions.
- **State-aware multimodal (2505.04653).**
  - Three phases: History Taking, then Diagnosis & Management, then Follow-up.
  - Internal state = patient profile with a *prioritized list of knowledge gaps* and an evolving DDx (not shown to the patient; update frequency configurable).
  - A decision module (Gemini 2.0 Flash) decides "continue history vs transition". Targeted questions and *multimodal artifact requests* (skin photo, ECG, documents) are generated to close gaps and reduce DDx uncertainty.
  - Results: 105 scenarios, 25 patient actors, 18 specialists. AMIE matched or exceeded PCPs on every axis and beat them on top-k DDx accuracy (p<0.001).
- **Lemonade mapping.** "Request a photo of X" becomes "look at the harness connector at the injector" through the glasses camera. The knowledge-gap list drives what to ask or look at next. The visit number becomes the work-order revisit (comeback) count.

### 1.3 MedGemma (open medical models used as agent components)
Source: arXiv 2507.05201 (v1 2025-07-07, v4 2026-04-06; Nat. Med. 32:3695–3704, 2026) https://arxiv.org/abs/2507.05201v4.
- Gemma 3 4B/27B medical VLMs. +10.8% on agentic evaluations vs base (AgentClinic, physician-agent role); fine-tuning cut EHR-retrieval errors by 50%. Positioned as a *tool inside* agents (e.g. a FHIR-navigation agent: plan what to fetch, fetch in steps, extract facts, combine; Google Cloud blog 2025-12-08, seen in search).
- **Transferable.** A small, domain-tuned open model as a perception/extraction tool inside a larger orchestrated loop; useful for on-device or edge use on glasses.

### 1.4 2025–26 follow-ups: learning the sequential policy
- **DiagGym / DiagAgent** (arXiv 2510.24654, v1 2025-10-28, v2 2026-02-10; https://github.com/MAGIC-AI4Med/DiagGym).
  - World model trained on EHRs generates exam results conditioned on evolving patient state. The agent is trained with multi-turn RL.
  - Reward = diagnosis accuracy + exam-recommendation F1 vs real EHR exams − turn penalty beyond 12 turns.
  - DiagBench: 2.2k cases, 3.3k physician rubrics.
  - Results: +11.20% accuracy and +17.58% exam F1 over 11 SOTA LLMs and 2 prompt-engineered agents; +7.1% weighted rubric score.
- **MedAction** (arXiv 2605.07305, v2 2026-10-22).
  - Names three LLM failure modes in active diagnosis: ungrounded test ordering, unreliable diagnostic update, degraded multi-turn coherence.
  - Builds 32,681 multi-turn trajectories by tree-structured LLM–environment interaction, filtered by KG-grounded metrics: Disease Trajectory Consistency (hypothesis converges) and Reasoning–Action Consistency (belief updates driven by evidence).
  - Fine-tuned 8B model is open-source SOTA on MedR-Bench and MedAction-300-Hard. The RL extension notes similarity-based dense rewards "are easily hacked" and that entropy regularization prevents test-ordering collapse.

---

## 2. Industrial / maintenance agents

### 2.1 IBM: AssetOpsBench + Maximo Assistant / Condition Insight
- **AssetOpsBench** (arXiv 2506.03828, v1 2025-06-04, v4 2026-08-30; https://arxiv.org/abs/2506.03828).
  - Catalog of 4 domain agents: IoT (sensor telemetry), FMSR (failure modes ↔ sensor relevance), TSFM (time-series foundation model), WO (work orders, a coding agent).
  - Data: 141 scenarios on 4 chillers and 2 AHUs; 2.3M sensor points; FMEA-derived failure models; 4.2K Maximo work orders over 11 years with ISO failure codes. Example query: "Why is the chiller efficiency dropping?"
  - Compares Agent-As-Tool (iterative ReAct-style supervisor that selects an agent and sub-task each step, compresses observations) vs Plan-Execute.
  - Results: no model exceeds 70% completion. GPT-4.1 hits 65% completion / 77% retrieval as Agent-As-Tool but drops to 38% under Plan-Execute ("plan-ahead introduces cascading failure modes"). Letting sub-agents ask the parent clarification questions lifted llama-4-maverick from 59% to 66%. Shorter, low-variance plans correlated with accuracy.
  - Emergent failure modes: Overstatement of Task Completion (23.8%), Ambiguous Output Formatting (21.4%), Ineffective Error Recovery (160 cases).
  - Community: 250+ users and 500+ agents on Codabench.
- **Maximo Assistant (agentic)** (IBM Docs, Maximo Application Suite 9.2, https://www.ibm.com/docs/en/masv-and-l/cd?topic=overview-maximo-assistant-architecture).
  - Supervisory "ALM agent" plus tools on a Maximo MCP server (JSON-RPC 2.0): NL→OSLC data retrieval, condition insights, docs search, schema retrieval.
  - Inherits user permissions. Llama-4-Maverick creates and verifies plans and routes; gpt-oss-120b handles the rest (July 2026 patch moves everything to gpt-oss-120b).
- **Maximo Condition Insight** (IBM, 2025-12-05, https://www.ibm.com/new/announcements/maximo-condition-insight): agentic APM capability evaluating work orders, metrics, time series, meter readings, FMEA and alerts to explain asset condition and recommend corrective actions.
- **Transferable.** Iterative tool-use beats rigid upfront plans for diagnosis. Let sub-agents ask clarifying questions. Watch for "overstated completion" (the agent claims "fixed" without verification), so require a verification step.

### 2.2 Siemens Industrial Copilot / Senseye Maintenance Copilot
- Press release 2025-03-24 (https://press.siemens.com/global/en/pressrelease/siemens-expands-industrial-copilot-new-generative-ai-powered-maintenance-offering): GenAI across the maintenance cycle (repair → prevention → prediction → optimization). "First pilot use cases have shown that the Industrial Copilot for maintenance helps save on average 25% reactive maintenance time" (vendor claim).
- Press release 2025-05-12 (https://press.siemens.com/global/en/pressrelease/siemens-introduces-ai-agents-industrial-automation): shift "from AI assistants that respond to queries towards autonomous agents". Planned machine-level Operations Copilot (end of 2025) for operators and service techs: query machine data and get error-resolution guidance in natural language. Simatic eaSie offers chat/voice access for field technicians.
- **Transferable.** Voice access in the field plus machine-data grounding is the product direction incumbents are taking; Lemonade's edge is senior-tech reasoning, not just Q&A.

### 2.3 GE Vernova APM (SmartSignal + GenAI prescriptive layer)
- Blog "The Alert That Knows the Next Step" (dated Oct 28, 2026 on page; https://www.gevernova.com/software/blog/intelligence-at-work-alert-that-knows-the-next-step).
  - When an alert fires, the GenAI layer interprets diagnostic context and generates prioritized recommendations from 4 sources: manuals, technical references/specs, case history of similar resolutions, SME knowledge and lessons learned. The IMS case library comes from decades of real resolutions.
  - **Feedback loop:** thumbs up/down per recommendation plus notes at case close feed back into the KB.
  - Runs on Amazon Bedrock with guardrails (sensitive info, content filters, denied topics, contextual grounding checks), cross-tenant isolation, and outputs traceable to source docs.
- Cosmo Oil MoU (2026-10-08, https://www.cosmo-energy.co.jp/en/information/press/2026/261008-01.html): APM beta agents include a Strategy Agent (FMEA/asset-strategy templates), an NLQ Agent, and a Document Intelligence Agent (inspection reports → anomalies).
- **Transferable.** Close every job with structured outcome feedback; it is the compounding moat ("a plant running this two years gets more specific guidance").

### 2.4 Honeywell
- Maintenance Assist (https://process.honeywell.com/us/en/services/maintenance-assist): GenAI over product manuals, knowledge articles and *service tickets*, on mobile and desktop.
- Experion Cognition Autonomous Operations Assistant (Control Global, 2025-11-11, https://www.controlglobal.com/show-coverage/honeywell-users-group/news/55329404/honeywell-offers-virtual-angels-for-your-shoulder): knowledge-capture tools harvest site docs and SME know-how into knowledge graphs spanning structured/unstructured data and *plant and causal models*, plus agents (MPC, causal AI, RL, SLMs, GenAI).
- **Transferable.** Causal/structural system models alongside text RAG.

### 2.5 Hitachi equipment-failure diagnosis agent (expert-process imitation)
- Hitachi R&D, 2026-05-21 (https://rd.hitachi.com/_ct/17838512).
  - Two ingredients: (a) "data": design drawings converted to a knowledge graph of part connections and hierarchy, so the agent can say *which part* rather than "the valve is broken"; (b) "skills": the expert's analysis process, encoded via the STAMP/CAST system-safety method.
  - Trial with Daikin from April 2025: cause-estimation accuracy 67% (general AI) → over 90%, about 10 s to name the specific suspect part. Field techs judged it "equivalent to or better than a typical maintenance technician" (vendor-reported).
- **Transferable.** Lemonade should model each machine as a component/signal/fluid-flow graph (wiring diagrams, hydraulic schematics) and reason over it with a codified troubleshooting method. Flat RAG over manuals is not enough.

### 2.6 AWS reference architectures and KONE
- AWS Solutions "Building an automotive technician with multimodal agentic AI" (https://docs.aws.amazon.com/solutions/building-an-automotive-technician-with-multimodal-agentic-ai-on-aws/): Bedrock supervisor agent delegating to collaborator agents (vehicle recall, service history, diagnostic, parts, service summary, warranty claim), OEM manuals ingested via Bedrock Data Automation into vector DBs, Lambda actions, Nova Sonic for voice. This is the closest public architecture to Lemonade.
- KONE case study (https://aws.amazon.com/solutions/case-studies/aws-ai-security-kone-case-study): Technician Assistant mobile app, used as a first step before calling the human Technical Help Desk, over manuals, historical maintenance reports and IoT data, for 40,000 technicians. Pilot: 100 users × 3 months, none opted out. Safety required "steps and checks to verify" correctness.
- **Transferable.** Escalation tiering (AI first, then the human expert desk) and parallel specialist sub-agents (recalls/TSBs, history, parts, warranty).

### 2.7 Aviation MRO
- Airbus Skywise Fleet Performance+ (https://www.skywise.com/en/digital-solutions/technical-operations/fleet-performance, page dated 2026-03-18): NLP detects repetitive faults, links technical documentation references, and "determine[s] a defect's most probable cause".
- Kubrick Defect Resolution AI Assistant (https://kubrickgroup.com/insight/inside-the-defect-resolution-ai-assistant/, 2025-12-15 per search): an "AI-memory" of defects tackled and remediation steps; chronic-defect tracking for planning; markets a "$14m" airline saving (vendor claim).
- **Transferable.** Repeat/chronic-defect detection across visits ("this unit has had this code three times") is a senior-tech signal.

### 2.8 Field evidence on technician assistants
- Train-commissioning troubleshooting assistant (Int. J. Production Research, published online 2025-07-09, https://www.tandfonline.com/doi/full/10.1080/00207543.2025.2527368). RAG chatbot; controlled field experiment with 19 technicians and 173 tasks. AI-assisted users significantly outperformed non-users, with larger gains for less-experienced technicians; moderated by AI attitude and familiarity.
- Ground-vehicle fault-code RAG evaluation (PHM Society 2025, https://papers.phmsociety.org/index.php/phmconf/article/view/4549). For label-matching to manual fault codes, retrieval-based methods beat LLM-based ones. The chat task struggled to link observations to fault codes. Takeaway: retrieval-first for code lookup, with the LLM for reasoning.
- PHM Copilots (PHM Society 2024, https://www.papers.phmsociety.org/index.php/phmconf/article/view/3906): LLM agents execute structured steps of the standard maintenance-recommendation protocol (data processing, failure-mode discovery, evaluation) triggered by PHM alerts, "without subverting human SME expertise".
- AI+AR guided visual diagnosis (PHM Society 2024, https://www.papers.phmsociety.org/index.php/phmconf/article/view/3909). Plan (diagnostic plan from a KG built by LLM from manuals) → track (perception module watches the technician's actions) → guide (AR recommends next steps). Directly analogous to glasses.

---

## 3. IT/SRE root-cause agents (sequential diagnosis under uncertainty)

### 3.1 Microsoft RCACopilot
arXiv 2305.15778 (v4 2023-11-13; EuroSys'24) https://arxiv.org/abs/2305.15778.
- **Loop.** Alert type → matched **incident handler** (an OCE-authored workflow of reusable actions: queries, scripts, decision branches) collects targeted diagnostic info → LLM summarizes → nearest-neighbor retrieval of past incidents → LLM picks the root-cause category with an explanation, and can propose *new* categories for unseen incidents (24.96% of incidents had a new category).
- **Results.** Micro-F1 0.766 and Macro-F1 0.533 (GPT-4) on a year of Microsoft Transport incidents, ~4.2 s per run. The collection module has been deployed across 30 teams for 4+ years.
- **Key finding.** Diagnostic info alone beat adding other context; excess info hurt.

### 3.2 Alibaba RCAgent
arXiv 2310.16340 (v3 2024-08-02; CIKM'24) https://arxiv.org/abs/2310.16340.
- ReAct-style controller on a privately deployed model plus **expert agents** (LLM-as-tool for domain analysis), JSON actions, and a `finalize` tool as the sole exit.
- Observation snapshot keys (OBSK) keep long tool outputs out of context. JSON repair and error handling. **Trajectory-level self-consistency**: sample multiple action trajectories and aggregate.
- Ablation: removing expert agents caused "a drastic drop in all metrics". Deployed in Alibaba Cloud's Flink platform diagnosis workflow.

### 3.3 AIOpsLab (Microsoft, MLSys 2025)
arXiv 2501.06706 (2025-01-12) https://arxiv.org/html/2501.06706; leaderboard https://microsoft.github.io/AIOpsLab/pages/leaderboard/.
- Live microservice environment with fault injectors and workload generators. An Agent-Cloud Interface exposes a small API (`get_logs`, `get_metrics`, `get_traces`, `exec_shell` with a security filter). Task ladder: detection → localization → RCA → mitigation. 48 problems.
- Results: RCA accuracy ReAct 45.45%, Flash 36.36%, GPT-4-w-shell 9.09%; mitigation Flash 54.55%. Leaderboard: OpsAgent (GPT-4) averages 78.75.
- Failure modes: wasted steps (repeat calls, non-existent APIs, multi-agent chatter), information overload, invalid API use, false-positive detection. The step limit matters.

### 3.4 Cloud-OpsBench (CUHK, 2026)
arXiv 2603.00468 (v1 2026-02-28, v2 2026-08-22) https://arxiv.org/html/2603.00468v2.
- 754 runtime-verified cases across 57 fault types, captured as *state snapshots* and replayed through standard diagnostic interfaces, so every agent sees identical evidence.
- Process metrics: Evidence Closure Rate, Redundant Action Rate, steps.
- Best Joint RCA Accuracy 0.76/0.68 vs ECR 0.38/0.15 ("final-answer correctness alone substantially overestimates" ability). Trajectory-as-ICL raised DeepSeek-V4-Flash from 0.76 to 0.83 JRA and 0.38 to 0.57 ECR; SOP prompting gave similar gains.
- **Transferable eval design.** Snapshot a vehicle's state (codes, freeze frames, live-data traces, photos, operator answers) once, replay to every agent version, and score evidence closure.

---

## 4. Expert persona / apprenticeship / tacit-knowledge capture

- **Cognitive Task Analysis in the age of AI** (MODSIM World 2025, https://www.modsimworld.org/papers/2025/MODSIM_2025_paper_11.pdf). CTA = elicitation (Critical Decision Method interviews, observation, *think-aloud*) → analysis (goals, decisions, situational cues, mental models) → representation. Synthesizes AI-assisted CTA across aviation, defense, healthcare, maritime, manufacturing. Risks: trust calibration, automation bias, expert disengagement.
- **Tacit-TALK** (Industry 4.0 Science, 2026-09-07, https://industry-science.com/en/articles/tacit-talk). Speech → LLM analysis → knowledge graph linked to equipment registers, SOPs and work orders (semiconductor maintenance). Dialogue rules:
  - one question at a time;
  - follow-ups chosen by conversation state and knowledge gaps;
  - intervene only when needed (avoid feeling like an interrogation);
  - graceful exit, so partial captures still count.
  
  A prompt sequencer rotates elicitation techniques (situational recall, reasoning/decision-making, knowledge transfer) across dimensions (problem context, action rationale, transferable lesson). Not yet empirically evaluated (authors).
- **Plant Memory** (arXiv 2610.19131, 2026-10-13). Technical language processing on SAP PM work orders → ISO 14224-aligned ontology. Each fact is reified with a confidence score, source evidence, and verification state. Rule-first extraction with an LLM "second reader" whose disagreements raise review priority rather than overwrite. Technicians answer targeted gap questions where failures repeat without a recorded cause. Served to agents via MCP.
- **Expert Mind** (arXiv 2603.14541, 2026-03-15, conceptual). Structured interviews + think-aloud sessions + corpus ingestion into RAG for an energy-sector expert; consent, IP, and right-to-erasure built in. Think-aloud on real or simulated problems "surfac[es] procedural and diagnostic knowledge that experts may not spontaneously verbalize in interview contexts".
- **KUPAS MASTER** (technical report, https://tongjiai4e.github.io/KUPAS-MASTER-Report/...). Turns work records and practitioner interviews into experience corpora. Six case elements: context, **cues**, judgment, action, **boundaries**, outcomes. Six libraries: rules, constraints, best practices, **negative examples**, corner cases, skills. Packaged as callable skills with explicit inputs, steps, dependencies and **stopping conditions**; keeps unresolved disagreements.
- **AI Expert Twin** (arXiv 2605.01401, v2 2026-05-09). Three-layer model of expert cognition: procedural (what they do), semantic (what they know and attend to; KG), decision (rules, heuristics, cues, trade-offs) modulated by a "tension vector" (risk preference, innovation, rigor, empathy, tradition).
- **Narrated expert demos → LLM guidance** (arXiv 2407.09147, 2024-07-12). An expert performs the task in VR while narrating; the transcript becomes LLM context for step-by-step multimodal trainee guidance.
- **TrainAR** (open source; MDPI 2021/2023; docs https://github.com/jblattgerste/TrainAR). Procedural AR trainings authored by domain experts as a visual-scripting **stateflow**:
  - Action nodes wait for user actions; Action Fork branches on which action was taken; Action Multi takes n actions in any order.
  - Instruction, Feedback, and **Insight** (expert tips) nodes.
  - A conclusion node does assessment.
  
  Non-programmer SMEs author the flow from work-process analysis. TPR (AAAI 2026) adds a formal plan with preconditions/effects that an LLM instructor checks student actions against.
- **Hitachi** (see 2.5): expert "skills" as a codified analysis method plus a structural KG is the most concrete measured example of "expert-process imitation" (67% → over 90%).

---

## 5. Vehicle / heavy-equipment specific signals (adjacent)
- AutoRepairBench (CIKM 2026; https://github.com/AutoRepairBench/AutoRepairBench): benchmark and distillation for long-tailed, safety-critical automotive repair reasoning (distills a domain-enhanced Qwen2.5-32B teacher into a smaller student). Worth evaluating against.
- Heavy-duty engine diagnostics (arXiv 2608.23161, 2026-08; abstract via search, not opened in full): text-only 65.3%, and naive fusion of complaints + DTCs + sensors helps little; modality dropout reached 68.8% on text+DTC. Suggests the customer complaint text carries most signal and sensors are sparse (>80% missing). *(Not opened in full; treat as a pointer.)*

---

## 6. Proposed Lemonade agent blueprint (synthesis; my design, not from any single source)

```
Voice/glasses front end  ── fast Dialogue agent (AMIE-style; empathetic, terse, hands-free)
        │ reads/writes
        ▼
  CASE STATE (shared, versioned): asset profile (make/model/serial/hours, config),
  complaint + operator answers, codes/freeze-frame/live data, inspections & photos,
  knowledge-gap list, ranked differential (p, supporting/refuting evidence),
  tests done (+cost: minutes, parts, invasiveness, safety), phase, visit/comeback count
        ▲
        │ async background reasoner (slow)
  Diagnostic Orchestrator (MAI-DxO panel):
   • Hypothesis: update ranked differential after every finding
   • Test-Chooser: next ≤3 checks maximizing discrimination among top hypotheses
   • Stewardship: cheapest-first (ask > look > measure > swap/teardown); veto low-yield
   • Challenger: what would falsify the leader? known pattern failures / TSBs?
   • Safety: lockout/tagout, hydraulic pressure, HV/EV, jacking — gates every step
   • Checklist: valid procedure names/specs, consistency with schematic graph
   Actions: ASK | INSPECT (camera) | MEASURE (meter/scan tool) | LOOKUP | COMMIT | ESCALATE
   Stop: commit when top p ≥ τ AND a confirming test passed; escalate on budget/turn cap
        │ tools
  Knowledge: OEM manuals/TSBs/recalls (retrieval-first for codes), component/signal/
  fluid graph from schematics (Hitachi), handler library = senior-tech playbooks per
  symptom/code (RCACopilot), case library of past fixes w/ outcome feedback (GE),
  fleet history & chronic-defect detector (Skywise)
        │
  Close-out: verify fix (re-test), structured outcome + thumbs feedback → case library;
  Tacit capture: when a senior tech overrides/solves, voice "debrief" with
  gap-targeted questions (Tacit-TALK) → verified facts w/ evidence+confidence (Plant Memory)
```

Evaluation ("LemonadeBench"): replayable snapshot cases (Cloud-OpsBench) with a gatekeeper that answers only what was asked and synthesizes plausible readings for unrecorded checks (SDBench), a labor+parts cost model (chargemaster ≈ labor-time guide + parts price), a judge rubric (4–5 = same repair), plus process metrics: evidence closure, redundant actions, questions-before-first-teardown, safety violations, and comeback rate in longitudinal tests (Science eLetter). Later: RL on that simulator with accuracy + test-F1 − turn penalty (DiagGym), avoiding hackable similarity rewards (MedAction).

---

## 7. Gaps / what I could not establish
- No public architecture details found for Boeing's MRO AI agents beyond AHMS references in secondary sources; Airbus Skywise is documented only at the product-claim level.
- Microsoft's own "maintenance agent" (e.g. Dynamics 365 Field Service Copilot) was not documented in pages I opened; only reference architectures for field service/SAP integration surfaced.
- Med-PaLM agentic follow-ups: none found beyond AMIE; Med-PaLM appears superseded by AMIE/MedGemma in Google's 2025–26 work.
- Siemens' 25% figure, Hitachi's 67%→>90%, KONE's pilot and Kubrick's $14m are vendor-reported, not peer-reviewed.
- The microsoft.ai "building medical superintelligence" post returned 404 on fetch; I relied on the Science article instead.
- TrainAR itself is pre-LLM; its relevance is the expert-authored stateflow pattern, not AI.

## 8. Source list (opened)
- MAI-DxO preprint: https://arxiv.org/abs/2506.22405 (2025-06-27/07-02) + HTML v2
- SDBench/DxO in Science: https://www.science.org/doi/10.1126/science.aeh7930 (2026-10-22)
- SDBench repo: https://github.com/microsoft/sdbench
- AMIE Nature: https://www.nature.com/articles/s41586-025-08866-7 (2025-04-09)
- AMIE disease management: https://arxiv.org/abs/2503.06074 (2025-03-08)
- AMIE multimodal: https://arxiv.org/html/2505.04653 (2025-05-06); blog https://research.google/blog/amie-gains-vision-a-research-ai-agent-for-multi-modal-diagnostic-dialogue/ (2025-05-01)
- MedGemma: https://arxiv.org/abs/2507.05201v4 (2025-07-07; v4 2026-04-06)
- DiagGym: https://arxiv.org/abs/2510.24654 (2025-10-28; v2 2026-02-10); https://github.com/MAGIC-AI4Med/DiagGym
- MedAction: https://arxiv.org/html/2605.07305 (v2 2026-10-22)
- AssetOpsBench: https://arxiv.org/abs/2506.03828 (2025-06-04; v4 2026-08-30)
- Maximo Assistant architecture: https://www.ibm.com/docs/en/masv-and-l/cd?topic=overview-maximo-assistant-architecture
- Maximo Condition Insight: https://www.ibm.com/new/announcements/maximo-condition-insight (2025-12-05)
- Siemens 2025-03-24: https://press.siemens.com/global/en/pressrelease/siemens-expands-industrial-copilot-new-generative-ai-powered-maintenance-offering
- Siemens 2025-05-12: https://press.siemens.com/global/en/pressrelease/siemens-introduces-ai-agents-industrial-automation
- GE Vernova: https://www.gevernova.com/software/blog/intelligence-at-work-alert-that-knows-the-next-step (Oct 28, 2026)
- Cosmo Oil × GE Vernova: https://www.cosmo-energy.co.jp/en/information/press/2026/261008-01.html (2026-10-08)
- Honeywell Maintenance Assist: https://process.honeywell.com/us/en/services/maintenance-assist
- Honeywell Experion Cognition: https://www.controlglobal.com/show-coverage/honeywell-users-group/news/55329404/honeywell-offers-virtual-angels-for-your-shoulder (2025-11-11)
- Hitachi: https://rd.hitachi.com/_ct/17838512 (2026-05-21)
- AWS automotive technician: https://docs.aws.amazon.com/solutions/building-an-automotive-technician-with-multimodal-agentic-ai-on-aws/
- KONE: https://aws.amazon.com/solutions/case-studies/aws-ai-security-kone-case-study
- Skywise FP+: https://www.skywise.com/en/digital-solutions/technical-operations/fleet-performance
- Kubrick: https://kubrickgroup.com/insight/inside-the-defect-resolution-ai-assistant/
- Train commissioning study: https://www.tandfonline.com/doi/full/10.1080/00207543.2025.2527368 (2025-07-09)
- Ground-vehicle RAG eval: https://papers.phmsociety.org/index.php/phmconf/article/view/4549 (2025)
- PHM Copilots: https://www.papers.phmsociety.org/index.php/phmconf/article/view/3906 (2024)
- AI+AR guided visual diagnosis: https://www.papers.phmsociety.org/index.php/phmconf/article/view/3909 (2024)
- RCACopilot: https://arxiv.org/abs/2305.15778 (v4 2023-11-13)
- RCAgent: https://arxiv.org/abs/2310.16340 (v3 2024-08-02)
- AIOpsLab: https://arxiv.org/html/2501.06706 (2025-01-12)
- Cloud-OpsBench: https://arxiv.org/html/2603.00468v2 (2026-08-22)
- CTA in the age of AI: https://www.modsimworld.org/papers/2025/MODSIM_2025_paper_11.pdf (2025)
- Tacit-TALK: https://industry-science.com/en/articles/tacit-talk (2026-09-07)
- Plant Memory: https://arxiv.org/abs/2610.19131v1 (2026-10-13)
- Expert Mind: https://arxiv.org/abs/2603.14541 (2026-03-15)
- KUPAS MASTER: https://tongjiai4e.github.io/KUPAS-MASTER-Report/assets/reports/KUPAS-MASTER-Technical-Report-EN.pdf
- AI Expert Twin: https://arxiv.org/html/2605.01401v2 (2026-05-09)
- Narrated expert VR assistant: https://arxiv.org/html/2407.09147 (2024-07-12)
- TrainAR nodes: https://github.com/jblattgerste/TrainAR/blob/main/Documentation/manual/TrainARNodes.md
- AutoRepairBench: https://github.com/AutoRepairBench/AutoRepairBench (CIKM 2026)
