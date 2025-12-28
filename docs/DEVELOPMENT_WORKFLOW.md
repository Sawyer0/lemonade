# Connected Intelligence Development Workflow

> **Maximum Impact Workflow** - Optimal order for using Claude Code skills and agents to build the Autonomous Hospital Middleware Platform.
>
> Research validation: [PIVOT.md](file:///c:/Users/Dawan/Desktop/projects/lemonade-mvp/PIVOT.md)

---

## Research → Implementation Traceability

Each phase below is validated by specific sections of PIVOT.md:

| Phase | PIVOT.md Section | Key Validation |
|-------|------------------|----------------|
| Phase 1: Entities | §6.1 Hybrid Logic | "Entities have finite states... transitions triggered by hard evidence" |
| Phase 1: Interfaces | §7 Actuation Layer | "Middleware must integrate with 'Write' APIs of third-party controllers" |
| Phase 2: XState | §6 Deterministic Logic | "XState as the deterministic execution layer... Safety Moat" |
| Phase 3: Go Ingestion | §3.3 Strategic Choice of Go | "Go's concurrency model is architecturally superior for high-throughput" |
| Phase 4: Mock Server | §5.3 Synthetic Data | "Stress-test against thousands of edge cases without exposing real records" |
| Phase 5: Integrations | §7.1-7.2 Actuation | "Honeywell Forge for HVAC, LenelS2 for Access Control" |
| Phase 5: FHIR | §8 Clinical Integration | "FHIR APIs supported by Epic and Oracle Health (Cerner)" |
| Safety Audits | §4.3, §6.1, §7.3 | "Privacy compliance, Safety Moat, Rate Limiting" |

---

## Phase 1: Foundation (Week 1-2)

> **Research Validation**: PIVOT.md §6.1 - "A hospital room has a finite set of states: CLEAN, OCCUPIED, DIRTY..."
> 
> **Research Validation**: PIVOT.md §2.2 - "Convergence of IT and OT Infrastructure"

### Step 1.1: Core Entities (Day 1-2)

**Use: `entity-designer` agent → `create-entity` skill**

Execute in this order (dependencies flow down):

```
1. "Create the Zone entity with ZoneId branded type"
   → packages/core/src/entities/Zone.ts

2. "Create the Space entity with SpaceId branded type, referencing ZoneId"
   → packages/core/src/entities/Space.ts

3. "Create the Entity entity (person/asset/device) with EntityId"
   → packages/core/src/entities/Entity.ts

4. "Create the Alert entity with AlertId"
   → packages/core/src/entities/Alert.ts

5. "Create the Workflow entity with WorkflowId"
   → packages/core/src/entities/Workflow.ts

6. "Create the index.ts barrel export for all entities"
   → packages/core/src/entities/index.ts
```

**Why this order?** Zone is the parent container, Space references Zone, Entity tracks location within Space/Zone.

**Validation checkpoint:**
```bash
npm run typecheck
```

---

### Step 1.2: Service Interfaces (Day 2-3)

**Use: `service-architect` agent → `create-interface` skill**

> **Research Validation**: PIVOT.md §7 - "The 'Missing Link' is the capability to write changes to the physical world"

Execute in this order (core → external):

```
1. "Create ISpaceService interface for space state management"
   → packages/core/src/interfaces/ISpaceService.ts

2. "Create IEntityService interface for tracking people and assets"
   → packages/core/src/interfaces/IEntityService.ts

3. "Create ILocationService interface for Cisco Spaces integration"
   → packages/core/src/interfaces/ILocationService.ts
   📖 PIVOT.md §3: Cisco Spaces Firehose

4. "Create IAccessService interface for LenelS2 door control"
   → packages/core/src/interfaces/IAccessService.ts
   📖 PIVOT.md §7.2: Physical Security and Access Control

5. "Create IEnvironmentService interface for Honeywell HVAC control"
   → packages/core/src/interfaces/IEnvironmentService.ts
   📖 PIVOT.md §7.1: HVAC and Energy Optimization

6. "Create IFHIRClient interface for EHR integration"
   → packages/core/src/interfaces/IFHIRClient.ts
   📖 PIVOT.md §8: Clinical Integration

7. "Create IAIService interface for NIM/LLM calls"
   → packages/core/src/interfaces/IAIService.ts
   📖 PIVOT.md §5: NVIDIA NIM and LLM Reasoning

8. "Update TYPES.ts with symbols for all new interfaces"
   → packages/core/src/di/TYPES.ts
```

**Validation checkpoint:**
```bash
npm run typecheck
```

---

### Step 1.3: Domain Configuration (Day 3-4)

**Use: `domain-configurator` agent → `domain-config` skill**

> **Research Validation**: PIVOT.md §6.2 - "Room Turnover Automation: A Case Study"

```
1. "Set up healthcare domain config with entity types and space types"
   → domains/healthcare/config.ts
   📖 Maps to: staff, patient, visitor, asset (PIVOT.md §3.2)

2. "Create healthcare workflows.json for space state machine"
   → domains/healthcare/workflows.json
   📖 States: CLEAN → OCCUPIED → DIRTY → CLEANING (PIVOT.md §6.1)

3. "Create healthcare safety-rules.json with fire exit and HIPAA rules"
   → domains/healthcare/safety-rules.json
   📖 PIVOT.md §7.2: "NEVER send LOCK to fire exits during active Fire Alarm"

4. "Create domain loader that binds config to DI container"
   → packages/infrastructure/src/di/domainLoader.ts
```

**Validation checkpoint:**
- [ ] Domain loads without errors
- [ ] Config exported correctly

---

### Step 1.4: Code Review Gate

**Use: `code-reviewer` agent** (proactive)

```
"Review all Phase 1 changes for architecture compliance"
```

Expected checks:
- [ ] All entities are pure Zod schemas (PIVOT.md §6.1: "finite states, deterministic rules")
- [ ] All interfaces are in core, implementations in infrastructure
- [ ] Branded types used for all IDs
- [ ] No business logic leaked into entities

---

## Phase 2: State Machines (Week 3-4)

> **Research Validation**: PIVOT.md §6 - "XState (State Machines) as the deterministic execution layer"
>
> **Key Quote**: "The AI suggests a state change, but the State Machine enforces the logic"

### Step 2.1: Space State Machine (Day 1-3)

**Use: `xstate-engineer` agent → `xstate-machine` skill**

```
1. "Create the generic space machine factory that loads states from domain config"
   → packages/core/src/machines/space.machine.ts
   📖 PIVOT.md §6.1: "States: CLEAN, OCCUPIED, DIRTY, CLEANING_IN_PROGRESS, AWAITING_INSPECTION"

2. "Add persistence integration to save snapshots to Postgres"
   → packages/infrastructure/src/persistence/PostgresSnapshotStore.ts
   📖 IMPLEMENTATION_PLAN.md: XState Persistence section

3. "Create SpaceService that orchestrates machine + events"
   → packages/infrastructure/src/services/SpaceService.ts
```

**Key requirements from PIVOT.md §6.2 (Room Turnover):**
- Wi-Fi Location: Detect patient left zone
- People Counting: Confirm `person_count: 0`
- Guard Timer: Wait 60s to prevent false positives
- Only then transition to DIRTY

---

### Step 2.2: Alert State Machine (Day 4-5)

**Use: `xstate-engineer` agent**

> **Research Validation**: PIVOT.md §7.2 - "Panic Button, Lockdown Events"

```
1. "Create the alert machine with states: active → acknowledged → resolved | escalated"
   → packages/core/src/machines/alert.machine.ts

2. "Create AlertService with escalation timers"
   → packages/infrastructure/src/services/AlertService.ts
```

**Alert types from PIVOT.md:**
- `STAFF_PANIC` - §7.2: Security lockdown trigger
- `DOOR_FORCED` - §7.2: Correlate with camera snapshot
- `PATIENT_ELOPEMENT` - §3.1: "Patient Elopement event" (Wi-Fi + zone boundary)

---

### Step 2.3: Safety Audit Gate

**Use: `safety-auditor` agent** (critical)

> **Research Validation**: PIVOT.md §6.1 - "Safety Moat"

```
"Audit all state machines for safety rule compliance"
```

Expected checks from PIVOT.md:
- [ ] Fire exit lock guard present (§7.2: "NEVER send LOCK to fire exits during active Fire Alarm")
- [ ] Guard timer on occupancy transitions (§6.2: "60 seconds persistent occupancy")
- [ ] PHI not logged (§4.3: "sovereignty over PHI")
- [ ] Clinical docs marked `preliminary` (§5.2: "status of preliminary")

---

## Phase 3: Go Ingestion Microservice (Week 3-4, parallel)

> **Research Validation**: PIVOT.md §3.3 - "The Strategic Choice of Go"
>
> **Key Quote**: "Go's concurrency model, built around goroutines and channels, is architecturally superior for this type of high-throughput, IO-bound workload"

### Step 3.1: Firehose Client

**Use: `go-engineer` agent → `go-ingestion` skill**

```
1. "Create the Go module structure at services/ingestion/"
   → services/ingestion/go.mod, cmd/server/main.go

2. "Implement the Cisco Spaces Firehose WebSocket client with reconnection"
   → services/ingestion/internal/firehose/client.go
   📖 PIVOT.md §3.5: "Keep Alive mechanism... watchdog timer... reconnection backoff"

3. "Implement the decimator with movement threshold and zone boundary filters"
   → services/ingestion/internal/decimator/decimator.go
   📖 IMPLEMENTATION_PLAN.md: Data Decimation Strategy

4. "Implement the Redis hot buffer writer"
   → services/ingestion/internal/buffer/redis.go

5. "Implement the TimescaleDB persistence layer"
   → services/ingestion/internal/persistence/timescale.go

6. "Create the Dockerfile for the ingestion service"
   → services/ingestion/Dockerfile
```

**Key requirements from PIVOT.md §3:**
- Handle "bursty" traffic (shift changes, emergencies)
- gRPC + Protocol Buffers for production (§3.4)
- JSON for dev/debug flexibility
- Device classification filtering (§3.2: ignore "Stationary IoT Sensors")

---

## Phase 4: Mock Server (Week 3-4, parallel)

> **Research Validation**: PIVOT.md §5.3 - "Synthetic Data and Benchmarking"
>
> **Key Quote**: "Stress-test against thousands of edge cases... without exposing real patient records"

### Step 4.1: Stream Generator

**Use: `python-developer` agent → `mock-server` skill**

```
1. "Create the Python mock server project structure"
   → services/mock-server/requirements.txt, main.py

2. "Implement the Firehose stream generator with NDJSON output"
   → services/mock-server/stream_generator.py
   📖 PIVOT.md §3.1: Device Location Update, IoT Telemetry events

3. "Implement downstream API mocks (ServiceNow, Honeywell, Webex, FHIR)"
   → services/mock-server/downstream_mocks.py
   📖 Validates write operations before production

4. "Create the room turnover scenario script"
   → services/mock-server/scenarios/room_turnover.py
   📖 PIVOT.md §6.2: Complete room turnover case study

5. "Create the panic button scenario script"
   → services/mock-server/scenarios/panic_button.py
   📖 PIVOT.md §7.2: Staff panic → lockdown → camera snapshot

6. "Create the auto-discharge scenario script"
   → services/mock-server/scenarios/auto_discharge.py
   📖 PIVOT.md §8.1: Patient moves to Discharge Lounge → draft summary

7. "Create the Dockerfile for the mock server"
   → services/mock-server/Dockerfile
```

---

## Phase 5: External Integrations (Week 5-6)

> **Research Validation**: PIVOT.md §7 - "The Actuation Layer: Bridging the Digital and Physical"

### Step 5.1: Integration Adapters

**Use: `integration-specialist` agent**

```
1. "Build the HoneywellForgeClient adapter implementing IEnvironmentService"
   → packages/infrastructure/src/external/HoneywellForgeClient.ts
   📖 PIVOT.md §7.1: setpoint JSON, "TemporaryHold" mode, rate limits

2. "Build the LenelS2Client adapter implementing IAccessService"
   → packages/infrastructure/src/external/LenelS2Client.ts
   📖 PIVOT.md §7.2: OpenAccess API, "Lock/Unlock/Pulse" commands

3. "Build the EpicFHIRAdapter implementing IFHIRClient"
   → packages/infrastructure/src/fhir/EpicFHIRAdapter.ts
   📖 PIVOT.md §8: DocumentReference.Create, docStatus: "preliminary"

4. "Build the NVIDIANIMAdapter implementing IAIService"
   → packages/infrastructure/src/ai/NVIDIANIMAdapter.ts
   📖 PIVOT.md §5.1: Llama 3 70B, TensorRT-LLM, ReAct pattern
```

**Rate limiting requirement (PIVOT.md §7.3):**
> "Honeywell Forge APIs enforce rate limits (e.g., 100 calls per minute)"
> Implement token-bucket rate limiter in Go adapter

---

### Step 5.2: Integration Safety Audit

**Use: `safety-auditor` agent**

> **Research Validation**: PIVOT.md §4.3, §7.3

```
"Audit all integration adapters for security and safety compliance"
```

Expected checks:
- [ ] No secrets in code
- [ ] Error handling on all external calls
- [ ] Rate limiter implemented (PIVOT.md §7.3)
- [ ] PHI sanitized before logging (PIVOT.md §4.3)
- [ ] HIPAA-compliant on-prem NIM deployment (PIVOT.md §5.1)

---

## Phase 6: Final Review (Week 7+)

### Step 6.1: Full Architecture Review

**Use: `code-reviewer` agent**

```
"Complete architecture review of all new code"
```

**Validate against PIVOT.md §9.2 - The Founder's Advantage:**
- [ ] High-performance (Go handles Firehose flood)
- [ ] Reliable (deterministic XState transitions)
- [ ] Safe (human-in-the-loop AI)

---

## Quick Reference: Agent Triggers

| When you say... | Claude invokes... | PIVOT.md Reference |
|-----------------|-------------------|-------------------|
| "Create a Space entity" | `entity-designer` | §6.1 |
| "Add a location service interface" | `service-architect` | §3, §7 |
| "Set up healthcare domain config" | `domain-configurator` | §6.2 |
| "Build the room state machine" | `xstate-engineer` | §6 |
| "Create the firehose client in Go" | `go-engineer` | §3.3 |
| "Build the mock server" | `python-developer` | §5.3 |
| "Review this code" | `code-reviewer` | §9.2 |
| "Audit safety rules" | `safety-auditor` | §4.3, §6.1, §7.3 |
| "Build the Honeywell adapter" | `integration-specialist` | §7.1 |

---

## Parallel Execution Tracks

```
Week 1-2:  ████████████████████████████████████████████████
           │ Track A: Entities + Interfaces (entity-designer, service-architect)
           │ Track B: Domain Config (domain-configurator)
           │ 📖 PIVOT.md §6.1, §2.2

Week 3-4:  ████████████████████████████████████████████████
           │ Track A: XState Machines (xstate-engineer) 📖 §6
           │ Track B: Go Ingestion (go-engineer) 📖 §3.3
           │ Track C: Mock Server (python-developer) 📖 §5.3

Week 5-6:  ████████████████████████████████████████████████
           │ Track A: External Integrations (integration-specialist) 📖 §7, §8
           │ Track B: End-to-end Testing with Mock Server

Week 7+:   ████████████████████████████████████████████████
           │ Track A: Production Hardening
           │ Track B: Real API Integration Testing 📖 §9.2
```

---

## Daily Ritual

1. **Morning**: Pick 1-2 tasks from current phase
2. **Execute**: Use appropriate agent trigger phrase
3. **Validate**: Run `npm run typecheck` + `npm test`
4. **Review**: Let `code-reviewer` run proactively after significant changes
5. **Commit**: Only after review passes

---

## Critical Gates (DO NOT SKIP)

| Gate | Agent | When | PIVOT.md Validation |
|------|-------|------|---------------------|
| After Phase 1 | `code-reviewer` | Before starting state machines | §6.1: Entities have finite states |
| After XState | `safety-auditor` | Before any door lock/unlock code | §6.1: Safety Moat |
| Before Integration | `safety-auditor` | Before connecting to real APIs | §7.3: Rate limiting |
| Before Deploy | `safety-auditor` + `code-reviewer` | Final gate | §4.3: HIPAA compliance |

---

## Anti-Patterns to Avoid

From PIVOT.md research:

1. ❌ **Skipping safety audits** - §6.1: "Relying solely on LLM to control physical systems is unacceptable"
2. ❌ **Building integrations before entities** - §6.1: "Entities have finite states" must be defined first
3. ❌ **Writing Go code before domain model** - Data structures must be stable
4. ❌ **Testing against real APIs before mock scenarios pass** - §5.3: Use synthetic data first
5. ❌ **Deploying without code review gate** - §9.2: "Will it crash under load? Will the AI do something crazy?"
6. ❌ **PHI in logs** - §4.3: "Hospital retains sovereignty over PHI"
7. ❌ **AI without XState guard** - §6.1: "AI suggests, State Machine enforces"

---

## The Autonomous Hospital Stack

From PIVOT.md §9.2 - The complete validated architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PERCEPTION (AI) - PIVOT.md §5                        │
│                    NVIDIA NIM + Llama 3 70B                             │
│                    "Analyzes complex data to generate signals"          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTEXT (State Machine) - PIVOT.md §6                │
│                    XState + Domain Config                               │
│                    "Evaluates events against current state"             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    EXECUTION (Adapters) - PIVOT.md §7                   │
│                    Honeywell + LenelS2 + Epic FHIR                      │
│                    "Physical change in the environment"                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Start Command

When you're ready to begin with Claude, just say:

> **"Create the Zone entity with ZoneId branded type"**

Claude will automatically invoke `entity-designer` → `create-entity` and produce the exact pattern from your skill template.

📖 This implements PIVOT.md §6.1 - Entities with finite states managed by deterministic logic.
