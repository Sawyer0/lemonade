# How automotive & heavy-equipment diagnostic products actually diagnose (research, 2026-11-11)

Scope: ~25 min of web_search + web_fetch. Every claim below cites a page I actually fetched, unless marked **[search excerpt only]**. Dates are page publish/update dates where shown; vendor claims are vendor claims, not audited.

---

## TL;DR: the five reasoning engines that exist in the market

| Engine | Who | Input | How it picks the next step | How it learns |
|---|---|---|---|---|
| **1. Frequency prior from confirmed repairs** ("what fixed this before") | Snap-on SureTrack / Top Repairs, Mitchell 1 ProDemand (same SureTrack), Identifix Direct-Hit, Bosch EBR, Predii | Vehicle (YMM/engine), DTC, symptom, **mileage** | Rank fixes by count of verified fixes for that vehicle+code(+mileage). Most common first. | Techs report "what fixed it"; experts validate/edit; counts update. |
| **2. Fault-tree / test plan with re-ranking** | VW ODIS Guided Fault Finding, Noregon JPRO Fault Guidance, Snap-on Guided Component Tests | Fault memory (all ECUs), vehicle variant, entered symptom (complaint) | Most-suspected component on top; each test result **re-evaluates the plan** and reorders/adds tests. YES/NO steps with expected values. | Authored by OEM/vendor engineers; updated weekly (JPRO) or per release. |
| **3. Expert rules over telemetry (no DTC needed)** | John Deere Expert Alerts, Volvo Remote Diagnostics, Detroit Connect Virtual Technician, Uptake | J1939/telematics streams, fault + pre/post-event data logs, warranty history | Rule fires → severity (yellow/red) → prescribed action + parts. Humans in an uptime center review severe cases. | Central analysts mine fleet + warranty failures, write/test new rules (Deere tests to "100% confidence" before release). |
| **4. Live-data range flags** | Snap-on Smart Data | PIDs filtered to the selected DTC | PIDs pre-armed with known-good high/low limits; out-of-range PIDs flagged red and a data "movie" auto-recorded. | Vendor-maintained limits. |
| **5. LLM/RAG copilots on top of 1–4** (2025–2026) | Bosch ESI[tronic] AI assistant (2026/4), Cat AI Assistant (2026), WrenchLane, CarSignal (YC S26), Tekmetric Ask Tek, Pairio (YC P26), Autel MAX voice | DTCs + symptoms in natural language/voice/photo; RAG over OEM docs, known-fix DBs, repair history | Ranked causes with likelihood %, each paired with a confirming check (where, what to measure, expected value). | Mostly not stated; Pairio/Bosch capture tech feedback; others rely on the underlying fix DB. |

The senior-tech behavior is **engine 1 (prior) × engine 2 (test that discriminates) × engine 4 (live data sanity) with a human expert escalation path** — and the products that feel most like a senior tech literally combine these on one screen (Snap-on Intelligent Diagnostics; Identifix Direct-Hit + Hotline).

---

## Product-by-product

### Snap-on Fast-Track Intelligent Diagnostics + SureTrack
Sources: ZEUS Training Module 7 (updated 2023-07-05) https://www.snapon.com/Diagnostics/US/KB/ZEUS-Training-Module-7.htm ; "Your Essential Guide to SureTrack" https://www.snapon.com/EN/US/Diagnostics/News-Center/Press-Release-Archive/What_Is_SureTrack ; UK "Troubleshooter Tips and Real Fixes" https://www.snapon.com/EN/UK/Diagnostics/News-Centre/latest-news/Troubleshooter-Tips-and-RealFixes
- **Input:** vehicle ID from scan (required), selected DTC, symptoms, mileage, components.
- **One screen per code** with cards: OEM TSBs/recalls/campaigns → **Top Repairs Graph** → **Smart Data** → functional (bi-directional) tests & resets → guided component tests → Real Fixes & tips → link to ProDemand/ShopKey.
- **Top Repairs Graph:** "most common verified fixes and/or probable causes for the code, based on actual repair orders." Example: P0420 → catalytic converter, "verified 1225 times, and occurred the most (240 times) in vehicles at about 150k miles." → **mileage-conditioned frequency prior.**
- **Smart Data:** filters PIDs to only those related to the code; "pre-armed using known-good upper and lower trigger values"; red flag when out of range; auto-saves a short data movie at the trigger with a cursor at the trigger point. Requires idle, warm engine, accessories off (test preconditions).
- **Guided component tests:** step-by-step, specs, where/how to connect leads, auto-configures meter/scope. Snap-on claims >7M guided tests.
- **Real Fixes:** complaint/cause/correction format with a "Fixed It" count; "over 2 billion repair records," "validated by SureTrack expert technicians."
- **Troubleshooter:** shows how DTCs and symptoms relate to commonly replaced components — "especially helpful when diagnosing multiple codes."
- **Why it feels senior:** the UK case study (2006 Mini Cooper S, P1688): OEM/TSB path says air leaks → MAP sensors → bypass valve → possibly reprogram/replace DME; experience data says **harmonic balancer** is the top fix for that engine/mileage. I.e., the product explicitly overrides the OEM tree with the field prior, then falls back to the OEM steps if the prior fails.
- **Learning:** repair-order harvesting + expert validation. Predii historically powered pattern mining of Snap-on repair-order/warranty data (Emerj, **[search excerpt only]**).

### Mitchell 1 ProDemand (SureTrack inside)
Sources: Mitchell 1 ShopConnection "Get the most out of ProDemand with SureTrack" **[search excerpt only]**; QuickSpecs press release 2026-06-15 **[search excerpt only]**
- Same SureTrack content (Mitchell 1 and Snap-on share a parent) with "over 1 billion repair records," surfaced via 1Search Plus cards alongside OEM info. Top Repairs ranks by year/make/model/mileage/DTC/component/symptom.
- 2025–2026 releases I saw are search UX ("Did You Mean" typo correction, Oct 2025; QuickSpecs, Jun 2026). I did **not** find an LLM diagnostic feature from Mitchell 1 itself; a WrenchLane comparison page (biased competitor) says "Nothing LLM-based has shipped or been announced." One SEO blog claimed ProDemand "uses AI"; unverified, treat as unreliable.

### Identifix Direct-Hit (Solera)
Sources: Solera blog "Making life easier for mechanical repair techs" (2022-10-05) https://www.solera.com/blog/making-life-easier-for-mechanical-repair-techs/ ; Identifix resources pages (2026-03/04) **[search excerpts only]**
- **Two knowledge stores:** (1) **Confirmed Fix** — "crowd-sourced, statistical database of over 3 million confirmed fixes… when they complete a job, they return to Identifix Direct-Hit and report back… 'what fixed it.' All confirmed fixes… are validated and edited by Solera specialists." (2) **Hotline Archive** — "shortcut test procedures… authored by our Hotline L1 master techs… Every time one of our hotline technicians helps another tech in the field, the archive is updated to capture in detail what worked and how." ~500K–1M documented repairs.
- Explicitly anti parts-cannon: "'throwing parts at a problem' is not the solution." The archive's role is the **shortcut confirmation test** for the likely fix (e.g., canister purge valve).
- **Live escalation:** hotline of ASE L1 master techs (avg ~15 years), can share live video, listen to noises, give a "second opinion before installing a part." Those calls feed the archive → closed loop.
- Fixes ordered "most to least common" (Identifix hotline archive page, **[search excerpt only]**).

### Bosch ESI[tronic] (EBR + 2026 AI assistant)
Sources: PMM interview (2026-03-18) https://pmmonline.co.uk/article/boschs-esitronic-diagnostic-software/ ; Bosch press release (2026-07-21) https://www.bosch-presse.de/pressportal/de/en/efficiently-find-the-right-repair-solution-ai-assistant-optimizes-esitronic-diagnostic-software-from-bosch-283840.html
- **Experience-Based Repair (EBR):** "1.7m cases of known fixes… for more than 150 brands"; techs "guided through the solution process step-by-step, from locating the issue, to diagnosing it and ultimately fixing it." EBR is linked **at the component level**.
- **Learning loop (interesting):** "leveraging AI to identify when people on different forums are talking about an issue. This flags to an author… the author investigates the issue, diagnoses it and finds a fix, then uploads it into ESI[tronic]." Plus "Mechanics can also vote on whether procedures work, so we're getting a constant feedback loop." → AI for **trend detection**, humans author the fix, users vote.
- Remote Diagnostic Service: human Bosch specialists on-demand within ~15 min via chat.
- **AI assistant (2026/4 update, end of 2026, Advanced/Master packages, no extra cost; Automechanika 2026 Innovation Award):** analyzes fault patterns over Bosch diagnostic data, repair instructions, OEM original documents, and other sources; "entering fault codes or short keywords is enough"; continuous dialog partner to "query diagnostic steps, or check alternative solutions." → RAG copilot grounded in EBR + OEM docs.

### VW Group ODIS — Guided Fault Finding (GFF)
Sources: VAS 505x operating manual p.97 (V03.0, 01/07) https://www.yumpu.com/en/document/view/24870071/vehicle-diagnostic-testing-and-information-systems-obd-china/97 ; NHTSA-filed VW TSB V201501 (2015) **[search excerpt only]**; SpringfieldVW ODIS workflow page **[search excerpt only]**
- **Input:** vehicle ID + variant, full control-unit scan (event memory entries in all ECUs), and if no faults, a **"Complaint Report"** (symptom entry).
- **Next-test selection (key quote):** "an automatic test plan is compiled from the fault symptoms that were available and that were entered. **The component with the highest degree of suspicion is placed at the very top** and is preselected… **The results of each function test lead to a re-evaluation of the test plan** with a suggestion for the next processing sequence, so the order of function tests suggested can change or others can be added."
- Function tests localize "down to the level of an individual component, lead and plug or control unit," dialog-controlled, use measured-value blocks, adaptations, internal multimeter/scope; techs can enter external measurements manually. Techs can add their own tests ("Select own test").
- Warranty coupling: VW TSB V201501 requires a completed GFF high-pressure fuel pump function test **for reimbursement** → the test record is evidence.
- A 2008 TU Braunschweig dissertation ("Wahrscheinlichkeitsbasierte Fahrzeugdiagnose auf Basis individuell generierter Prüfabläufe", doi 10.24355/dbbs.084-200808180200-9) describes GFS as decision-tree programs authored by teams and proposes probability-based individually generated test sequences **[search excerpt only; page blocked]**.
- Not researched in time: Toyota Techstream, GM GDS2/SPS, Ford IDS/FDRS guided routines. Expect the same pattern (OEM-authored symptom/DTC trees), but unverified here.

### Noregon JPRO (heavy-duty, all makes)
Sources: Autonumen walkthrough (2025-04-21) https://www.autonumen.com/blog/how-to-use-jpros-guided-diagnostics-and-troubleshooting-feature/ ; Noregon JPRO pages/user guide **[search excerpts only]**
- **Input:** J1939, J1587/J1708, ISO 15765, KWP2000; no VIN required; freeze frame for J1939 faults where available; live "Vehicle Values."
- **Repair Mentor:** auto-pops on connect when active faults exist; **prioritizes vehicle issues** (critical first, e.g. active engine fault), shows "Most Likely Repair" and road-worthiness, then "Begin Diagnostics" → Fault Guidance.
- **Fault Guidance:** tabs for overview, wiring, troubleshooting (YES/NO prompts; volt-ohm checks show **actual vs expected range**), locator photos, bi-directional tests launched in-flow (e.g., ACM reset before forced regen), final **verify repair** step (clear code, check if it recurs). Live values can answer a step ("resistance > 50 Ω?") without a manual measurement. Weekly content updates.

### Caterpillar (Cat AI Assistant, 2026)
Sources: Caterpillar press release (2026-01-06) https://www.caterpillar.com/en/news/corporate-press-releases/h/cat-ai-assistant.html ; Western States Cat page (2026-04-02) **[search excerpt only]**; Mobility Engineering Tech (2026-04-01) **[search excerpt only]**
- Runs against "the entire Caterpillar knowledge base" on the **Helios** data platform (16+ PB). Per dealer page: 1.5M connected assets, O&M manuals, parts catalogs, purchase history.
- Technician mode: **voice**, "without interrupting the task at hand," pulls the right manual section, step-by-step repair guidance, "highlights common issues and suggests additional parts needed." Example prompt: "step-by-step guide to fix a low oil pressure fault code."
- Architecture: "a group of AI agents operating together on top of our digital ecosystem" (Mobility Eng Tech, excerpt). In-cab edge version on NVIDIA Jetson Thor.
- Remote Troubleshoot on connected machines lets dealers run diagnostic tests remotely so techs arrive with parts (Construction Equipment, 2025-04, **[search excerpt only]**).
- Not covered in time: Cat ET internals, Cat Inspect, Cat condition monitoring analytics.

### John Deere Expert Alerts / Service ADVISOR Remote
Sources: RDO Equipment podcast transcript (2019-10-23) https://www.rdoequipment.com/resources/podcasts/podcast-ep.-103-expert-alerts-from-john-deere ; Deere pages and Grain Central (2017) **[search excerpts only]**
- **Expert Alerts do not require DTCs**; they're rules over "complete machine data." Example: "Replace Turbo" alert "looks for encoder count and the learn span to exceed a certain threshold"; high-pressure fuel pump alerts compare one 8245R's data over time against other 8245Rs.
- Built by Deere's Machine Health Monitoring Center by combining DTCs + **warranty failures + engineering history** to find failure trends and write triggering rules (Grain Central excerpt). Dealers + Deere "test Expert Alerts extensively to gain 100% confidence" before release.
- Output is a **prescribed solution** ("follow the detect solution"), "little to no troubleshooting," often zero diagnostic time at the machine; critical vs high priority.
- Service ADVISOR Remote: remote DTC read/clear, **remote machine recording** with trigger points for intermittent faults, remote programming.

### Volvo Trucks Remote Diagnostics / Uptime Center; Detroit Connect Virtual Technician
Sources: Fleet Maintenance (2024-10-17) https://www.fleetmaintenance.com/in-the-bay/diagnostic-and-repair/article/55136246/modern-remote-diagnostics-platforms-offer-more-info-than-just-fault-codes ; Truck News (2024-11-22) https://www.trucknews.com/technology/the-problem-solvers-how-volvo-leverages-connectivity-to-improve-uptime-fleet-profitability/1003191494/ ; Truck News (2013-09-18) https://www.trucknews.com/products/detroits-virtual-technician-eliminates-downtime-in-80-of-incidents/
- Volvo: analytics **rule engine** over truck data; "if it's this code with that code with something else, that may mean something different" → **code combinations + operational values**, not single codes. Outputs meaning, urgency, likely parts. Severity: **yellow** (finish the mission, fix at next stop) vs **red** (divert to nearest dealer with parts in stock; tow if needed). Dealer pre-notified so bay is ready. Volvo claims −70% diagnostic time, −22% repair time, 97% accuracy. SAS platform; context like altitude, ambient temp, gear, RPM, torque (SAS case study, **[search excerpt only]**).
- Detroit Virtual Technician: instead of a freeze-frame snapshot, records **all parameters from 60 s before to 15 s after** the event ("the secret sauce"), because the condition usually starts ~30 s before the lamp. Severe events reviewed by human experts in a support center (45 staff, 200–250 events/day in 2013). 80% of incidents were safe to keep driving. ~20% of fault events are driver-actionable (Detroit sell sheet, **[search excerpt only]**).
- Noregon/Kenworth use 4-level severity (green/yellow/orange/red).

### Uptake (heavy fleets / DoD)
Source: https://uptake.com/department-of-defense/ (page dated 2025-02-10 in search)
- Inputs: maintenance records, parts data, sensor feeds, works on sensored and **unsensored** assets. "150 pre-built models flag likely failures at the component level" → prescriptive next steps + part needs. Claims up to 20% faster diagnosis. 2020 TT News piece: uses battery cranking voltage at sub-second intervals + fleet failure history (**[search excerpt only]**).

### Predii (repair-order intelligence; powers others)
Source: https://www.predii.com/capabilities/specialized-ai-pipelines
- Pipeline: ingest raw RO verbatims → NLP feature extraction → **ontology/taxonomy alignment** → clustering of similar repair cases → insights (symptoms, components, repairs). Example: "Customer states grinding noise when stopping. Technician inspected the brakes and found gravel between heat shield and brake rotor." Also offers terminology mapping (tech slang like "BOO switch"), SME quality control, fine-tuned embedding/retriever models, LLM copilots (site nav).

### 2025–2026 AI copilots / startups
- **WrenchLane** (Sweden, ~Feb 2026 launch; https://wrenchlane.com/en-us, fetched 2026-11-11): "Fault codes and symptoms in, ranked causes out… reads the codes together, the way an experienced mechanic would." Ranked causes with % (e.g., P0299 + P2563 → turbo actuator 75%, VGT carbon binding 65%, linkage 40, boost leak 35, sensor drift 20) + severity + matched TSBs. **"Check it on the car before you buy the part":** each cause comes with location, what to measure, expected value from OEM data (e.g., pin 3 = 0.1 V, YES/NO). Then OEM repair steps with labor time per step → auto-written complaint/cause/correction invoice text. Per-vehicle job history in chat. OEM data via Infopro/HaynesPro (EU) and MOTOR (NA). Input by typing, voice, or **photo of the scan tool screen**. 750+ workshops have run a diagnosis.
- **CarSignal** (YC S26; https://www.ycombinator.com/companies/carsignal): custom OBD-II scanner feeds "factory level context to a diagnostic agent"; "AI agents research vehicle-specific failure patterns and surface the tests that confirm or rule out each cause." Plus receptionist, estimate, marketing agents. 40+ shops, 18 states.
- **Tekmetric Repair Guide / Ask Tek** (early access 2026-11-03; https://www.tekmetric.com/post/new-tekmetric-tools-help-shops-fix-more-vehicles-finish-inspections-faster-and-answer-more-calls): OEM info inside the RO (auto VIN decode → matching procedures/wiring/TSBs); Ask Tek plain-language Q&A ("what commonly causes a misfire on an Audi SQ5") with OEM procedure attached; **labor times recommended from hours logged at real Tekmetric shops**. DVI Quick Capture: photos/video/audio → drafted findings the tech must accept/edit. 8 European makes at launch.
- **Shopmonkey:** release notes I saw (2025–2026) show no diagnostic AI; not verified further.
- **Pairio** (YC P26; https://yespress.io/pairio-yc-p26, 2026-07-30): factory techs, not automotive, but the loop is directly relevant: photo/voice → search OEM manuals + past repair records → step-by-step fix; **after the repair, tech talks through what they did; Pairio structures it into reusable know-how.** Claims −25% MTTR across 4 German plants (vendor figures).
- **Autel** (MaxiSys Ultra S2 etc., 2025): MAX hands-free voice assistant for navigation/active tests, AI image analysis for DVI dents/scratches; product page explicitly says "Diagnostic conclusions should still be based on the applicable test procedure, service information and technician judgment" (autel-us product page 2026-06-22, **[search excerpt only]**). Autel's 2024 annual report says it launched an AI Voice Agent and AI Inspection Agent on an industry LLM and plans "fault analysis agents, diagnostics agents" (**[search excerpt only]**).
- **Launch X-431** PAD IX: "real-time repair suggestions driven by AI" and an X-431 FIX repair database (**[search excerpts only]**; no mechanism detail found).
- Others seen only in search excerpts, unverified: VehiLoop (custom OBD + copilot with confidence scores and confirming tests), CarTechIQ PredictaFix (ranked fixes from DTC+symptoms+history+recalls), THINKCAR "Tyler" agent (2026-07), Opus IVS Blueprint Copilot (2025-11, ADAS repair planning), Zymbly (YC W26, aviation voice copilot that writes compliant records), Ascentt OEM warranty agent (maps DTC + freeze frame combos to root causes from repair outcomes; claims $30M warranty savings).

---

## Patterns Lemonade should copy (ranked)

1. **Two-layer belief: field prior × OEM test tree.** Rank hypotheses by confirmed-fix frequency conditioned on vehicle/engine/**mileage**/DTC set (Snap-on Top Repairs, Identifix, Bosch EBR), but every hypothesis must carry an OEM-style discriminating test. Snap-on's P1688 harmonic-balancer case is the canonical "senior tech beats the factory tree" example. Lemonade's differential should store `prior_source` (field vs OEM vs inferred) per hypothesis.
2. **Re-plan after every test result** (VW GFF: most-suspected on top; "results of each function test lead to a re-evaluation of the test plan"). That's exactly Lemonade's "next test reduces uncertainty" loop; add cost/time/invasiveness so cheap, decisive checks go first (WrenchLane "check before you buy the part"; Identifix "shortcut tests").
3. **Every test step = location + connection + precondition + expected value + YES/NO.** (JPRO actual-vs-expected; WrenchLane pin 3 = 0.1 V; Smart Data preconditions: idle, warm, accessories off.) This is the schema for Lemonade's Observation records and makes glasses-captured readings machine-checkable.
4. **Read codes as a set, plus operating context.** Volvo: code combos + operational values; Snap-on Troubleshooter for multi-code; WrenchLane "reads the codes together." Don't diagnose DTC-by-DTC.
5. **Capture the window, not the snapshot.** Detroit's 60 s pre / 15 s post log; Snap-on auto-records a data movie at a PID trigger; Deere remote recording with triggers for intermittents. Lemonade's capture layer should ring-buffer PIDs + video and freeze around events.
6. **Severity triage first, diagnosis second.** Yellow/red (Volvo), 4-color (Noregon/Kenworth), JPRO Repair Mentor prioritizes the critical fault and road-worthiness. Deterministic safety policy owns this, matching Lemonade's existing design.
7. **Close the loop with a confirmed-fix record in complaint/cause/correction form.** Identifix's "what fixed it" report, Snap-on Real Fixes, Bosch voting, Pairio's spoken post-repair recap, WrenchLane auto-written invoice text. Make the confirmed-fix capture a by-product of the RO/invoice (zero extra typing) — that's the data moat. Only verified fixes increment priors; expert/QA validation step before they count (all incumbents do this).
8. **Verify-the-repair step is mandatory** (JPRO: clear code, check recurrence; Snap-on functional tests to validate; VW warranty needs the GFF test record). That's Lemonade's evidence ledger → warranty packet.
9. **Telemetry rules for "no DTC yet" failures** (Deere Expert Alerts from thresholds + fleet comparison + warranty history). For fleet/heavy customers, a rules layer learned from fleet failures is a separate product from in-bay diagnosis.
10. **Human expert escalation feeds the knowledge base** (Identifix hotline → archive; Bosch remote specialists; Detroit/Volvo uptime centers review severe events). Lemonade's verifier "abstain/escalate" should route to a human and write the resolution back.
11. **Mine unstructured ROs with an ontology** (Predii: verbatim → features → taxonomy → clusters) and **detect emerging issues** from forums/field chatter to trigger authoring (Bosch). Cheap cold-start for priors without owning 2B records.
12. **Low-friction inputs:** voice (Cat, Autel MAX, Pairio), photo of the scan tool screen (WrenchLane), auto VIN decode (Tekmetric). Matches the glasses thesis.

## Gaps / not established in this pass
- Not researched: Toyota Techstream, GM GDS2/SPS, Ford IDS/FDRS internals; Cat ET, Cat Inspect, Cat condition monitoring; Komatsu; Pitstop; Tractable (collision photo AI); ALLDATA; startups "Revv", "Wrench", "Torque AI", "Gotcha", "ShopGenie" (ShopGenie appears only as a Tekmetric customer-follow-up partner in a search excerpt).
- No vendor publicly discloses Bayesian/ML internals for ranking; "frequency of verified fixes" is the only mechanism explicitly described (Snap-on). Whether any uses formal value-of-information for test ordering is not public; VW's "degree of suspicion" re-ranking is the closest documented analogue.
- All performance numbers (Volvo 97%, Pairio −25%, Uptake 20%) are vendor claims.
