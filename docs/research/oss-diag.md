# Open-source code & datasets for Lemonade (agentic neurosymbolic vehicle + heavy-equipment diagnosis)

Compiled 2026-11-11. Metadata (stars, last push, license) pulled live from the GitHub REST API, PyPI JSON, npm registry, and Hugging Face API on 2026-11-11. "Push" = last push to any branch. Only links I actually saw are listed. Verdicts are mine.

Legend: ADOPT = use as a dependency / data source now · ADAPT = copy ideas/code into our own module · REF = read for design, don't depend · SKIP = not worth it.

---

## 0. Ranked shortlist (top 15)

| # | Item | License | Signal | Use in Lemonade | Verdict |
|---|------|---------|--------|-----------------|---------|
| 1 | NHTSA flat files + API (complaints, recalls, investigations, TSB/Manufacturer Communications) — https://www.nhtsa.gov/nhtsa-datasets-and-apis | US public domain | complaints zip 359 MB, updated 2026-11-09 | Priors (P(component \| make/model/year/symptom)), recall/TSB tool, eval set from complaint narratives | ADOPT |
| 2 | cantools/cantools | MIT | ★2.3k, push 2026-11-10 | DBC/KCD/ARXML decode in Python service; J1939 frame-id helpers | ADOPT |
| 3 | commaai/opendbc | MIT | ★3.6k, push 2026-11-10 | Large corpus of reverse-engineered passenger-car DBCs | ADOPT (data) |
| 4 | OBDb (org, 898 repos incl. OBDb/SAEJ1979, OBDb/.schemas) — https://github.com/OBDb | CC-BY-SA-4.0 | SAEJ1979 push 2026-11-10 | Per-vehicle PID/scaling/DTC signal sets in JSON; standard Mode 01 PID table | ADOPT (watch share-alike) |
| 5 | Wal33D/dtc-database | MIT (code) | ★62, push 2026-02-16 | SQLite of 12,128 unique DTCs (9,415 generic + 9,390 OEM rows, 33 makes) with Py/TS wrappers | ADOPT w/ provenance check |
| 6 | pgmpy/pgmpy | MIT | ★3.4k, push 2026-11-10 | BN / causal inference engine for the probabilistic layer (Python side) | ADOPT |
| 7 | pyAgrum (PyPI `pyagrum` 3.3.2) | LGPL-3.0 OR MIT | active (conda feedstock push 2026-10-27) | Faster exact inference, influence diagrams (cost-of-test decisions) | ADOPT (alt to pgmpy) |
| 8 | nmfta-repo/pretty_j1939 | Apache-2.0 | ★82, push 2026-04-15 | J1939 candump pretty-printer + J1939DA(xls/xlsx)→JSON converter | ADOPT (needs licensed J1939DA) |
| 9 | pylessard/python-udsoncan + python-can-isotp; hardbyte/python-can | MIT / MIT / LGPL-3.0 | ★743 / ★316 / ★1.6k, all pushed Oct–Nov 2026 | UDS (0x19 ReadDTCInformation, snapshots/freeze-frame records), ISO-TP, bus I/O | ADOPT |
| 10 | brendan-w/python-OBD (PyPI `obd` 0.7.3) | GPL-2.0 | ★1.3k, push 2025-04-07 | ELM327 + Mode 01/03/07 decode, freeze-frame DTC cmd | REF / isolate (GPL) |
| 11 | Ircama/ELM327-emulator | NOASSERTION (check) | ★704, push 2026-09-17 | Multi-ECU ELM327 simulator for CI and agent eval | ADOPT for testing |
| 12 | The-Swarm-Corporation/Open-MAI-Dx-Orchestrator (PyPI `mai-dx`) + ngoanpv/open-mai-dxo | MIT / Apache-2.0 | ★81 push 2026-07-27 / ★3 push 2026-07-07 | Sequential-diagnosis orchestrator pattern (hypothesis panel, test chooser, cost budget, checklist/stewardship roles) | ADAPT (port pattern to TS) |
| 13 | AutoRepairBench/AutoRepairBench | Code MIT; data license unstated | ★0, push 2026-08-25; CIKM '26 paper | 117,465 ECU/DTC → fault description + repair-measure pairs (BMW-centred) + gated LLM evaluator | REF/ADAPT eval (confirm data rights) |
| 14 | wi2trier/cbrkit | MIT | ★29, push 2026-11-09, ICCBR'24 best student paper | Case-based retrieval over past repair cases (similarity composition, API/CLI) | ADOPT |
| 15 | IBM/AssetOpsBench | Apache-2.0 | ★2.4k, push 2026-11-11 | Industrial asset O&M agent benchmark/framework (closest analogue for heavy equipment); also IBM/FailureSensorIQ (CC-BY-4.0, ★54) sensor↔failure-mode MCQA | REF / eval harness |

**Biggest gap:** there is no truly open, licensed J1939 SPN/FMI dictionary. SPN names/scalings live in SAE J1939DA (paid). Open tools (pretty_j1939, J1939DB) are frameworks that *consume* a DA you buy. FMI 0–31 table is small and widely documented, so hand-write it. Either buy the SAE J1939DA spreadsheet license (price not checked), or ship heavy-equipment v1 with only DM1 parsing (SPN number + FMI + OC) + OEM manuals.

**Second gap:** no maintained, permissive JS/TS Bayesian-network or model-based-diagnosis (GDE/Reiter hitting-set) library. Plan: run BN in the Python sidecar (pgmpy/pyAgrum) and write our own small TS hitting-set / conflict engine (it's ~300 lines; Reiter HS-tree or a SAT/MaxSAT call).

---

## 1. DTC databases & parsers (OBD-II / SAE J2012)

| Repo / dataset | License | Activity | What it gives | Verdict |
|---|---|---|---|---|
| https://github.com/Wal33D/dtc-database | MIT | ★62, push 2026-02-16 | `data/dtc_codes.db` SQLite (~3.1 MB): 18,805 rows, 12,128 unique codes, 9,415 generic SAE J2012, 9,390 OEM-specific across 33 makes; P/B/C/U split; wrappers Python (stdlib sqlite3), Java, Android, TypeScript (repo source, not published to npm). Built from 37 text files in `data/source-data/`. | Best open DTC table found. ADOPT, but audit `source-data/` provenance — OEM descriptions likely scraped from commercial sites; SAE J2012 text itself is SAE-copyrighted. Treat the descriptions as "best effort", never as authoritative. Sister repos: Wal33D/nhtsa-vin-decoder (MIT, ★24), Wal33D/nhtsa-recall-lookup (MIT). |
| https://github.com/mytrile/obd-trouble-codes | MIT | ★61, push 2014-05-20 | Generic codes in JSON/CSV/SQLite | Stale; superseded by Wal33D. SKIP |
| https://github.com/fabiovila/OBDIICodes | MIT | ★22, push 2023-12-05 | Codes in JSON + C header | Small, stale. SKIP |
| https://github.com/sathya1495/obd2-dtc-database | NOASSERTION | ★1, push 2026-05-13 | DTC JSON with causes + severity | License unclear; tiny. REF only |
| https://github.com/OBDb (898 repos) | CC-BY-SA-4.0 | Very active (repos pushed 2026-11-10/11) | Community per-make/model JSON "signal sets" (PIDs, scalings, some DTCs), schemas in OBDb/.schemas, standard PIDs in OBDb/SAEJ1979, VS Code tooling OBDb/vscode-obdb (Apache-2.0). Front-end: obdb.community / clutch.engineering | ADOPT as PID knowledge. Share-alike: keep it as a separate data asset; don't merge into a proprietary KB without attribution/SA compliance. |
| HF `CodesList/obd2-codes` — https://huggingface.co/datasets/CodesList/obd2-codes | CC-BY-4.0 | mod 2025-10/2026-10, 80 dl | OBD2 code list | Unverified contents; quick cross-check source. REF |
| HF `Ichlibitiche/mechanicdb-obd2-repair-sample` | ODbL | mod 2026-10-24 | Free 90-code sample (75 SAE + 15 OEM) mapping DTC → ordered repair procedures, DIY difficulty, parts cost, labor hours. Full set is paid ($49/$149). | Good schema reference for our "repair action" ontology; sample too small to rely on. REF |

## 2. CAN / J1939 / UDS / ELM327 / PID & freeze frame

| Repo | License | Activity | What it gives | Verdict |
|---|---|---|---|---|
| https://github.com/cantools/cantools | MIT | ★2.3k, push 2026-11-10 (PyPI 45.1.2) | DBC/KCD/SYM/ARXML parse, encode/decode, candump monitor | ADOPT (Python side) |
| https://github.com/commaai/opendbc | MIT | ★3.6k, push 2026-11-10 | DBC files for many passenger cars + Python car API | ADOPT DBCs as data; ignore control code |
| https://github.com/linux-can/can-utils | no SPDX (GPL/BSD mix in headers) | ★3.0k, push 2026-10-14 | candump/cansend/isotp tools, j1939 utilities (testj1939, j1939cat) for SocketCAN | Use as CLI tooling on edge/Linux; don't link. ADOPT (tooling) |
| https://github.com/hardbyte/python-can | LGPL-3.0 | ★1.6k, push 2026-11-11 | Bus abstraction (SocketCAN, PCAN, Kvaser, Vector, slcan, virtual) | ADOPT (LGPL ok as dependency) |
| https://github.com/pylessard/python-udsoncan | MIT | ★743, push 2026-10-26 | Full UDS ISO 14229 client: 0x19 ReadDTCInformation incl. snapshot (freeze-frame) and extended data records | ADOPT — this is how we get freeze frames on modern ECUs |
| https://github.com/pylessard/python-can-isotp | MIT | ★316, push 2026-11-10 | ISO-TP transport | ADOPT |
| https://github.com/mdabrowski1990/uds | MIT | ★152, push 2026-11-09 | Alternative UDS package | REF (udsoncan more mature) |
| https://github.com/I-CAN-hack/automotive | MIT | ★104, push 2026-11-10 | Rust + Python bindings: ISO-TP, UDS, adapters | REF; candidate for a fast edge agent |
| https://github.com/DanielMartensson/Open-SAE-J1939 | MIT | ★659, push 2026-11-10 | C J1939 stack for embedded/PC (address claim, transport, DM messages) | ADOPT for heavy-equipment edge firmware/simulator; not a SPN dictionary |
| https://github.com/nmfta-repo/pretty_j1939 | Apache-2.0 | ★82, push 2026-04-15 | Decodes candump J1939 to JSON (PGN, SA, SPN values) and converts J1939DA xls/xlsx → JSON | ADOPT, but requires a licensed SAE J1939DA |
| https://github.com/SystemsCyber/J1939DB | MIT | ★11, push 2025-04-05 | Server serving JSON decode data; "framework only", needs your own DA | REF |
| https://github.com/andrewdodd/decoda | MIT | ★9, push 2025-06-30 | J1939 application-data decoding utility | REF |
| https://github.com/benkfra/j1939 | MIT | ★76, push 2022-04-04 | Python J1939 stack (PyPI `j1939`) | Stale; REF |
| https://github.com/yorickdewid/J1939 | GPL-3.0 | ★20, push 2026-05-01 | Rust J1939 codec | SKIP (GPL) |
| https://github.com/alperunlu/DTCparser | none | ★7, push 2026-07-18 | J1939-73 DTC (4-byte) → SPN/FMI/CM/OC converter | No license; re-implement (trivial bit math). REF |
| https://github.com/keith-soderberg/j1939-cat-diagnostics | none | ★3, push 2026-03-04 | Arduino J1939 tooling + ECM emulation for Caterpillar equipment | Interesting for heavy-equip sim; no license. REF |
| https://github.com/STAS63-bit/sitrak-error-codes | NOASSERTION | push 2026-08-10 | 7,847 SITRAK truck DTC/SPN/FMI codes (Russian) | Shows OEM SPN tables exist in the wild; license unclear. REF |
| npm `@embedded32/j1939` (1.0.1, 2026-07-06), `@pamoja/can` (0.2.0, 2026-09-24), `@csllc/j1939` (2.0.0, 2026-04-07) | see npm | new | TS J1939 stack/decoding for learning/simulation | Young; evaluate `@pamoja/can` for TS-side frame parsing. REF |
| npm `dbc-can` (1.6.0, 2022), `candied` (2.2.0, 2023) | ISC | stale | DBC parsing in JS/TS | `candied` usable for TS-side decode if we must avoid Python; else use cantools. REF |
| https://github.com/brendan-w/python-OBD | GPL-2.0 | ★1.3k, push 2025-04-07 | ELM327 driver, Mode 01 PID decoders, Mode 03/07 DTCs, FREEZE_DTC; most-used Python OBD lib | GPL-2.0 → keep out of our distributed code; run as separate process or re-implement decoders from OBDb/SAEJ1979. REF/isolate |
| https://github.com/fr3ts0n/AndrOBD | GPL-3.0 | ★2.2k, push 2026-11-08 | Mature Android ELM327 app incl. freeze frame, plugin system | REF (GPL) |
| https://github.com/edu-amr/elm327 | MIT | ★7, push 2026-10-13 | Node/TS ELM327 over USB/BT/WiFi | Small but right stack + license. ADAPT for TS edge client |
| https://github.com/mustachedeveloper/obd2-simulator | MIT | ★0, push 2026-10-03 | Zero-dep deterministic ELM327/OBD-II simulator in TS | Handy for TS unit tests. ADOPT (tests) |
| https://github.com/Ircama/ELM327-emulator | NOASSERTION | ★704, push 2026-09-17 | Python ELM327 emulator, multi-ECU scenarios | Best simulator; confirm license file before redistributing. ADOPT for CI |
| https://github.com/COVESA/vehicle_signal_specification | MPL-2.0 | ★454, push 2026-11-09 | Standard vehicle signal taxonomy (VSS) | ADOPT as naming backbone for our signal ontology |
| https://github.com/eclipse-kuksa/kuksa-databroker | Apache-2.0 | ★84, push 2026-11-03 | VSS server (Rust) | REF |
| https://github.com/evanshortiss/obd-parser, https://github.com/sipimokus/node-obd2 | GPL-3.0 / MIT | 2017 | Old Node OBD libs | SKIP |

## 3. LLM / agentic car-diagnosis repos (2024–2026)

None of these is neurosymbolic; they are mostly "OBD data → LLM explains". Useful for tool-surface design and UX, not reasoning.

| Repo | License | Activity | What it gives | Verdict |
|---|---|---|---|---|
| https://github.com/ThinkOffApp/CarWatch | AGPL-3.0 | ★305, push 2026-10-09 | Raspberry Pi 5 in-car agent, local 35B model, OBD tiles, voice, manual RAG | REF (AGPL — don't copy code) |
| https://github.com/speed785/open-mechanic | MIT | ★48, push 2026-08-29 | python-obd + Claude → plain-English diagnosis, severity, repair steps, cost | REF for output schema |
| https://github.com/iamneilroberts/shadetree-ai | MIT | ★26, push 2026-10-10 | MCP server: 17 read-only tools (DTCs stored/pending/permanent, MIL, freeze frame, readiness, Mode 06, VIN), read-only enforced in code, NHTSA lookup, local dashboard | Best MCP tool-surface reference; ADAPT tool names/safety model |
| https://github.com/petrpatek/obd2-mcp-server | none | ★12, push 2026-05-16 | OBD-II MCP server | No license. REF |
| https://github.com/october-dev/car-use | MIT | ★1, push 2026-11-11 | Agent skill (SKILL.md) for Claude Code/Codex to read & diagnose real or virtual car | REF (very new) |
| https://github.com/walcracia/carclaw | MIT | ★4, push 2026-06-04 | "Evidence-first" diagnostic-agent protocol (AGENTS.md/SKILL.md, zh+en): no final diagnosis without evidence, separate manual facts from AI inference, no write ops without authorization | ADAPT its evidence/audit rules into our guardrails |
| https://github.com/x51xxx/AndrOBD-AIBridge | AGPL-3.0 | ★1, push 2026-06-06 | AndrOBD plugin emitting token-efficient JSON frames for LLMs | REF (idea: compact telemetry frames) |
| https://github.com/cyanheads/nhtsa-vehicle-safety-mcp-server | Apache-2.0 | ★3, push 2026-11-04 | MCP: VIN decode, recalls, complaints, crash ratings, investigations; uses flat files per NHTSA API policy | ADOPT/ADAPT as our NHTSA tool |
| https://github.com/shoka-jp/automotive-ai-skills | MIT | ★2, push 2026-11-09 | Agent skills for diagnostics/maintenance (JP/EN) | REF |
| https://github.com/sa1701/gearhead | none | ★1, push 2026-11-11 | Local RAG over 22 workshop manuals with page citations | REF |
| https://github.com/shreyasikar1522/AI-Diagnostic-KG-meets-vehicle-intelligence | none | ★0, push 2026-08-09 | Hierarchical KG + hybrid retrieval + calibrated fault diagnosis | Only KG-diagnosis repo found; tiny. REF |
| https://github.com/Pranav-M23/Car_Assistant_LLM, pedrohmietlicki/llm-vehicle-diagnostic-api, Shubhayang6/TorqueTalk-GPT (Apache-2.0), alifesoftware/OBD2LLM (MIT) | mixed | ≤4★ | Student/demo projects | SKIP |

Papers (no code seen) worth reading for the KG+LLM layer: "An Automotive Fault Diagnosis Framework Based on KGs and LLMs" (MDPI Electronics 2025, https://www.mdpi.com/2079-9292/14/21/4180 — proprietary 130k dialogue dataset); PHM 2025 "Evaluation Framework for Fault Diagnosis Using Technical Manuals in RAG LLMs" (https://papers.phmsociety.org/index.php/phmconf/article/view/4549 — ground-vehicle; finds retrieval beats LLM for fault-code label matching).

## 4. Probabilistic & symbolic reasoning libraries

| Library | License | Activity | Role | Verdict |
|---|---|---|---|---|
| pgmpy — https://github.com/pgmpy/pgmpy | MIT | ★3.4k, push 2026-11-10, PyPI 1.1.2 | Discrete BNs, VE/BP inference, structure & parameter learning, causal tools | ADOPT (default) |
| pyAgrum (PyPI `pyagrum` 3.3.2) | LGPL-3.0 OR MIT | active | Fast exact inference (C++), influence diagrams/LIMIDs — ideal for "which test next given cost" | ADOPT for decision layer |
| erdogant/bnlearn | MIT (PyPI) | ★646, push 2026-11-10 | Structure learning wrapper over pgmpy | Optional, for learning priors from NHTSA |
| jmschrei/pomegranate | MIT | ★3.5k, push 2025-03-06 | PyTorch probabilistic models incl. BNs | REF (slowing) |
| JS BN: vangj/jsbayes (Apache-2.0, ★41, 2023), bayesjs/bayesjs (MIT, ★17, 2022), npm `samiam` (2024) | — | stale | Small JS BN inference | Not production-grade; keep BN in Python. SKIP/REF |
| Fault trees: rakhimov/scram (GPL-3.0, ★168, 2023), volkm/dftlib (GPL-3.0, 2026-07), jmateusms/faultree (BSD-3, new) | — | — | FTA/minimal cut sets | Fault trees compile easily to BNs; use pgmpy. REF |
| Hitting sets / MBD: TheMatjaz/minihit (NOASSERTION, ★11, 2018); major-scale/epistemic-microworlds-diagnosis (no license, 2026); ismail-v/circuit-fault-diagnosis (MIT, Z3-based conflicts + hitting sets, 2026) | — | tiny | Reiter/GDE demos | No maintained GDE library exists (PyPI `pymbd`/`diagnosis` are unrelated packages). Write our own TS engine; use ismail-v (MIT) and minihit as references; Z3 (`z3-solver`, also z3 wasm for TS) for consistency checks. |
| CBR: wi2trier/cbrkit | MIT | ★29, push 2026-11-09 | Typed CBR retrieval, similarity composition, LLM adaptation hooks, API/CLI | ADOPT |
| Gradient boosting baseline: dmlc/xgboost | Apache-2.0 | ★29k | Learned priors from complaints | Optional |

## 5. Datasets

| Dataset | License | Size / signal | Use | Verdict |
|---|---|---|---|---|
| NHTSA ODI flat files — https://www.nhtsa.gov/nhtsa-datasets-and-apis ; field docs https://static.nhtsa.gov/odi/ffdd/cmpl/CMPL.txt , https://static.nhtsa.gov/odi/ffdd/tsbs/TSBS.txt | US public domain | Complaints `FLAT_CMPL.zip` 359 MB (updated 2026-11-09), since 1995; recalls; investigations; Manufacturer Communications (TSB summaries since 1995, CSV + TSV) | Component-level priors by MMY; symptom text → component labels; recall/TSB lookup tool; eval cases | ADOPT (core). Use flat files for bulk (NHTSA API policy), API for live lookups. |
| AutoRepairBench — https://github.com/AutoRepairBench/AutoRepairBench ; paper https://dl.acm.org/doi/10.1145/3799682.3840599 | Code MIT; dataset terms not stated | 117,465 ECU/DTC/trigger → fault description + service measures (BMW-centred), multi-gate LLM evaluator (entity match on ECU/DTC, unsafe-repair check) | Eval for "DTC → repair" step; evaluator design | ADAPT evaluator; confirm data license before training |
| IBM/AssetOpsBench — https://github.com/IBM/AssetOpsBench | Apache-2.0 | ★2.4k; KDD'26 etc. | Industrial asset O&M multi-agent benchmark (heavy-equipment analogue) | REF / adapt harness |
| IBM/FailureSensorIQ — https://github.com/IBM/FailureSensorIQ | CC-BY-4.0 | ★54 | MCQA on sensor ↔ failure-mode relations for 10 industrial assets | Eval of sensor/failure-mode reasoning |
| HF build-small-hackathon/nemotron-car-diagnostics-datasets | no license tag | 15,048 synthetic QA rows w/ reasoning traces | Synthetic SFT data | REF (synthetic, unlicensed) |
| HF build-small-hackathon/car-diagnostic-agent-trace | Apache-2.0 | agent trace JSONL | Agent trajectory examples | REF |
| HF vic35get/nhtsa_complaints_dataset | Apache-2.0 | 12.5k complaints, 5-class component labels | Quick baseline classifier | REF (just use raw NHTSA) |
| HF zhengr/Automotive_Industry_Fault_Data_Set | Apache-2.0 | Chinese fault-text → KG triples (performance-fault / part-fault / composition / test-tool) | Template for KG extraction schema | REF |
| Zenodo "Automotive Faults Dataset for Diagnostic and Maintenance Systems" — https://zenodo.org/records/15626055 | CC-BY-4.0 | 61 KB JSON + 4 flowcharts (brake/electrical/overheating/transmission) | Seed fault-symptom-procedure trees | Tiny; seed only |
| HF CJJones/Vehicle_Diagnostics_LLM_Training_Sample | CC-BY-NC-4.0 | 32.7k synthetic rows | — | SKIP (NC + synthetic) |
| HF NCSOFT/K-DTCBench | CC-BY-NC-4.0 | (Korean doc/table/chart VQA — not vehicle DTCs) | — | SKIP (name collision) |
| AMCK (ScienceDB) — https://doi.org/10.57760/sciencedb.25099 | not checked | 43,962 instruction/input/output maintenance QA (likely Chinese) | — | Lead only; not opened |
| EngineFaultDB, TechManualQA-700 (Zenodo 10.5281/zenodo.17410809), Hyundai Staria manual QA | — | cited in search results | — | Leads only; not verified |

## 6. Medical sequential-diagnosis code to adapt (MAI-DxO family)

Microsoft published the paper (arXiv:2506.22405) but no code and no SDBench cases (NEJM-copyrighted) — per ngoanpv/open-mai-dxo README.

| Repo | License | Activity | What it gives | Verdict |
|---|---|---|---|---|
| https://github.com/The-Swarm-Corporation/Open-MAI-Dx-Orchestrator (PyPI `mai-dx`) | MIT | ★81, push 2026-07-27 | 8 role agents (hypothesis, test-chooser, challenger, stewardship/cost, checklist…), 5 modes (instant / question-only / budgeted / no-budget / ensemble), cost table for 25+ tests, 5-point judge | ADAPT: map "tests" → shop actions (scan, smoke test, fuel-pressure, scope) with $ and minutes. Depends on Swarms framework — port logic, don't import. |
| https://github.com/ngoanpv/open-mai-dxo | Apache-2.0 | ★3, push 2026-07-07 | Dependency-free stdlib reimplementation of MAI-DxO + SDBench harness (gatekeeper that reveals findings only when asked, cost accounting, judge) with mock model | ADAPT — cleanest code to port the gatekeeper/benchmark loop to TS; build "VehicleDxBench" on NHTSA/AutoRepairBench cases |
| https://github.com/raarmstrong/ADK-DxO | MIT | ★2, push 2026-10-07 | Google ADK version | REF |
| https://github.com/ossiver-GEL/GraphDx | none | ★9, push 2026-04-12 | Cost-aware knowledge-enhanced multi-agent sequential diagnosis (paper code) | No license → read only. REF (closest to our KG+cost idea) |
| https://github.com/woqingdoua/cros-risk-constrained-stopping | NOASSERTION | 2026-10 | Risk-constrained stopping rule for sequential diagnosis agents | REF for "when to stop testing" |

---

## Recommended stack (implied)
- **TS monorepo**: agent orchestrator (MAI-DxO pattern ported from open-mai-dxo), own hitting-set/conflict engine, ELM327 client adapted from edu-amr/elm327, OBD PID decode from OBDb/SAEJ1979 JSON, DTC lookup on Wal33D SQLite, tests on obd2-simulator.
- **Python sidecar**: pgmpy/pyAgrum (BN + influence diagrams for next-best-test), cantools + opendbc DBCs, python-can + udsoncan + can-isotp (freeze-frame via UDS 0x19), pretty_j1939 (with licensed J1939DA) for heavy equipment, cbrkit for case retrieval.
- **Data**: NHTSA flat files for priors/eval; AutoRepairBench + AssetOpsBench/FailureSensorIQ for eval; OBDb for PIDs.
- **License hygiene**: keep GPL (python-OBD, AndrOBD, scram, yorickdewid/J1939) and AGPL (CarWatch, AIBridge) out of shipped code; OBDb is CC-BY-SA (attribute, keep separate); verify Ircama/ELM327-emulator and AutoRepairBench data terms.

## Not established / gaps
- No open J1939 SPN dictionary; heavy-equipment OEM codes (CAT/Deere/Komatsu) not found in any licensed open dataset.
- No open car-repair-forum corpus with clear license found (didn't find a "MechQA"); scraping forums has ToS issues.
- No maintained JS BN or GDE library.
- Kaggle not searched directly (only the MechanicDB Kaggle mirror was seen).
