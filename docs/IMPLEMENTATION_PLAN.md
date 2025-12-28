# Connected Intelligence Middleware Platform - Implementation Plan

## Summary

Complete pivot from automotive diagnostic platform (Lemonade MVP) to a **domain-agnostic** Connected Intelligence Middleware Platform.

**Key Architectural Principles:**
- **Domain-agnostic core** - Generic entities (Space, Entity, Zone) with domain-specific configuration layers
- **Anemic domain models** - Entities are pure Zod schemas (data only), all logic lives in injectable services
- **Strictly typed** - TypeScript strict mode, Zod runtime validation, branded types where needed
- **Flexible configuration** - Hospital, hospitality, logistics are config/adapter layers, not core code

Preserves architectural patterns (XState, DI, streaming) while enabling multi-domain deployment.

## Target Architecture

```
connected-intelligence/
├── packages/
│   ├── core/                    # Domain-agnostic core (NO business logic)
│   │   └── src/
│   │       ├── entities/        # Pure Zod schemas: Space, Entity, Zone, Workflow, Alert
│   │       ├── interfaces/      # Service contracts (IAIService, ILocationService, etc.)
│   │       ├── machines/        # Generic XState: space.machine.ts, workflow.machine.ts
│   │       ├── types/           # Branded types, streaming protocol, base configs
│   │       └── events/          # Domain event schemas (LocationEvent, StateChange, etc.)
│   │
│   └── infrastructure/          # Implementations (injectable services)
│       └── src/
│           ├── ai/              # AI adapters (NVIDIANIMAdapter, etc.)
│           ├── di/              # Inversify container + domain config loader
│           ├── external/        # Integration clients (Cisco, Honeywell, Lenel, FHIR)
│           ├── services/        # ALL business logic lives here
│           └── repositories/    # Data access (Firestore, etc.)
│
├── domains/                     # Domain-specific configurations (NOT code)
│   ├── healthcare/
│   │   ├── config.ts            # Maps Space→Room, Entity→Staff/Patient
│   │   ├── workflows.json       # XState workflow definitions
│   │   ├── safety-rules.json    # Domain-specific safety patterns
│   │   └── prompts/             # AI prompts for clinical use
│   ├── hospitality/
│   │   ├── config.ts            # Maps Space→GuestRoom, Entity→Guest/Housekeeper
│   │   └── ...
│   └── logistics/
│       └── ...
│
├── services/
│   ├── ingestion/               # Go microservice - HIGH THROUGHPUT (on-prem/private cloud)
│   │   ├── cmd/server/main.go
│   │   ├── internal/
│   │   │   ├── firehose/        # Cisco Spaces WebSocket client
│   │   │   ├── decimator/       # Data decimation (1000 events → 10 signals)
│   │   │   ├── buffer/          # Redis hot buffer
│   │   │   └── persistence/     # TimescaleDB writer
│   │   ├── Dockerfile
│   │   └── go.mod
│   │
│   ├── mock-server/             # Python - Development/Testing simulation
│   │   ├── stream_generator.py  # Firehose event generator (newline-delimited JSON)
│   │   ├── downstream_mocks.py  # ServiceNow, Honeywell, Webex, FHIR mock endpoints
│   │   ├── scenarios/           # Scripted test scenarios
│   │   │   ├── room_turnover.py
│   │   │   ├── panic_button.py
│   │   │   └── auto_discharge.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── orchestrator/            # Node.js - XState logic layer (on-prem/private cloud)
│       ├── src/
│       │   ├── machines/        # XState actors (loaded from domain config)
│       │   ├── persistence/     # Snapshot save/restore to Postgres
│       │   └── publisher/       # Firebase "signal" publisher (state changes ONLY)
│       ├── Dockerfile
│       └── package.json
│
├── src/                         # Next.js API - "Front Door" (Firebase)
│   └── app/api/                 # ONLY for UI sync, NOT ingestion
│       ├── spaces/              # Read-only space status
│       ├── alerts/              # Alert management
│       └── admin/               # Configuration
│
└── functions/                   # Cloud Functions - notifications only
    └── src/triggers/
        ├── onAlertCreated.ts    # Push notification to staff
        └── onStateChange.ts     # Sync to mobile clients
```

## Components to Retire

| File/Directory | Reason |
|----------------|--------|
| `packages/core/src/machines/mechanic.machine.ts` | Automotive-specific |
| `packages/core/src/prompts/MechanicPrompts.ts` | Automotive domain |
| `packages/infrastructure/src/services/MechanicReasoningService.ts` | Automotive logic |
| `packages/core/src/types/models.ts` (Vehicle, SafetyRecall) | Automotive entities |
| `packages/infrastructure/src/external/NHTSAService.ts` | Automotive API |
| `agent/` | Replaced by Go microservice |
| `mobile/` | Defer (staff app later) |

## Patterns to Preserve

1. **XState hybrid AI + deterministic logic** - `mechanic.machine.ts` pattern
2. **3-layer safety gating** - Reactive (regex) → Semantic (LLM) → XState guards
3. **Inversify DI container** - `container.ts` structure with ~40 bindings
4. **Interface-driven adapters** - Swap Gemini → NVIDIA NIM
5. **NDJSON streaming** - `StreamingEvent` protocol for real-time events

---

## CRITICAL: Hybrid High-Throughput Architecture

### The Firestore "Firehose" Trap

**DO NOT use Firestore as the ingestion engine.** It has fatal cost and performance limits:

| Problem | Impact |
|---------|--------|
| **Cost trap** | 1,000 events/sec = 86M writes/day = **$4,500/month** just for raw data |
| **500/50/5 rule** | Hard ceiling at 500 writes/sec per indexed collection |
| **Not designed for telemetry** | Firestore is for app state, not time-series data |

### The 3-Layer Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: INGESTION HUB (On-Prem / Private Cloud) - 100k+ events/sec    │
│ ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐             │
│ │ Cisco Spaces│───▶│   Redis     │───▶│   TimescaleDB    │             │
│ │  Firehose   │    │ Hot Buffer  │    │  (Telemetry)     │             │
│ └─────────────┘    └──────┬──────┘    └──────────────────┘             │
│                           │                                             │
│                           ▼                                             │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 2: LOGIC LAYER (On-Prem / Private Cloud) - XState + Supermemory  │
│ ┌─────────────────────────────────────────────────────────────────┐    │
│ │                     DATA DECIMATION                              │    │
│ │    1,000 raw events ──▶ 10 actionable signals ──▶ 1 AI prompt   │    │
│ └───────────────────────────────┬─────────────────────────────────┘    │
│                                 │                                       │
│ ┌───────────────┐    ┌──────────▼──────────┐    ┌──────────────────┐   │
│ │   Postgres    │◀──▶│   XState Actors     │───▶│   Supermemory    │   │
│ │  (Snapshots)  │    │  (State Machines)   │    │  (Knowledge)     │   │
│ └───────────────┘    └──────────┬──────────┘    └──────────────────┘   │
│                                 │                                       │
│                    ONLY state changes go down                           │
│                                 ▼                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 3: FRONT DOOR (Firebase) - UI Sync Only                          │
│ ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│ │  Firestore  │    │  Firebase   │    │    FCM      │                  │
│ │ (App State) │    │   Auth      │    │  (Alerts)   │                  │
│ └─────────────┘    └─────────────┘    └─────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Hot Buffer** | Redis Streams | Ultra-fast ingestion, 100k+ ops/sec |
| **Telemetry History** | TimescaleDB | Optimized for time-series, auto-compression |
| **Logic/State** | XState (Node.js) | Deterministic state machines |
| **Snapshot Persistence** | Postgres | XState actor snapshots survive restarts |
| **Knowledge Base** | Supermemory | Manuals, protocols, RAG |
| **App Sync** | Firestore | ONLY final "signal" state to UI |
| **Auth** | Firebase Auth | Google Identity (HIPAA BAA covered) |
| **Push Notifications** | FCM | Staff alerts |

### HIPAA Compliance

| Service | BAA Status | Action Required |
|---------|------------|-----------------|
| Firestore | ✅ Covered | Sign BAA in GCP Console |
| Cloud Functions | ✅ Covered | Sign BAA in GCP Console |
| Firebase Auth | ✅ Covered | Sign BAA in GCP Console |
| Realtime Database | ⚠️ Complex caveats | **Avoid** - use Firestore |
| FCM | ⚠️ Not for PHI | Only send alert IDs, not content |

---

## Data Decimation Strategy

### The Problem

A mid-sized hospital with 500 tagged assets broadcasting every 2 seconds = **250,000 events/min**.
Most are noise: "I'm still here at the same location."

### The Solution: Filter 1,000 Raw Events → 10 Signals → 1 AI Prompt

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DATA DECIMATION PIPELINE                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  RAW EVENTS (1,000/sec)                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ beacon_001: x=45.2, y=12.1, rssi=-65, t=1704067200           │   │
│  │ beacon_001: x=45.3, y=12.1, rssi=-64, t=1704067202           │   │
│  │ beacon_001: x=45.2, y=12.0, rssi=-66, t=1704067204           │   │
│  │ ... (997 more "I'm still here" pings)                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ FILTER 1: Movement Threshold                                  │   │
│  │ Drop if: distance < 2m from last reported position            │   │
│  │ Result: 1,000 → 100 events                                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ FILTER 2: Zone Boundary Crossing                              │   │
│  │ Only emit if: entity crossed into a NEW zone                  │   │
│  │ Result: 100 → 25 events                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ FILTER 3: State-Relevant Events                               │   │
│  │ Only emit if: event would trigger XState transition           │   │
│  │ Examples: ENTITY_ENTERED_SPACE, ENTITY_LEFT_SPACE             │   │
│  │ Result: 25 → 10 signals                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  SIGNALS (10/sec)            ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ { type: "ENTITY_LEFT_SPACE", entityId: "patient_123",        │   │
│  │   spaceId: "room_456", timestamp: 1704067200 }               │   │
│  │ { type: "ENTITY_ENTERED_SPACE", entityId: "staff_789",       │   │
│  │   spaceId: "room_456", timestamp: 1704067205 }               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ AGGREGATOR: Batch Signals for AI                              │   │
│  │ Group by: spaceId + 30-second window                          │   │
│  │ Result: 10 signals → 1 AI prompt                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  AI PROMPT (1/30sec)         ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ "Room 456 status: Patient left at 10:00:00. Staff entered    │   │
│  │  at 10:00:05. Current occupancy: 1. Suggest next action."    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Ingestion Schema

```typescript
// services/ingestion/internal/decimator/schema.go

// Raw event from Cisco Spaces (HIGH VOLUME - store in TimescaleDB)
type RawLocationEvent struct {
    DeviceID    string    `json:"device_id"`
    X           float64   `json:"x"`
    Y           float64   `json:"y"`
    Z           float64   `json:"z,omitempty"`
    RSSI        int       `json:"rssi"`
    ZoneID      string    `json:"zone_id"`
    FloorID     string    `json:"floor_id"`
    Confidence  float64   `json:"confidence"`
    Timestamp   time.Time `json:"timestamp"`
}

// Decimated signal (LOW VOLUME - send to XState orchestrator)
type Signal struct {
    Type        string    `json:"type"`      // "ENTITY_ENTERED_SPACE", "ENTITY_LEFT_SPACE", etc.
    EntityID    string    `json:"entity_id"` // Resolved from device_id
    EntityType  string    `json:"entity_type"` // "staff", "patient", "asset"
    SpaceID     string    `json:"space_id"`
    ZoneID      string    `json:"zone_id"`
    Timestamp   time.Time `json:"timestamp"`
    Metadata    map[string]any `json:"metadata,omitempty"`
}

// Signal types (domain-agnostic)
const (
    SignalEntityEnteredSpace = "ENTITY_ENTERED_SPACE"
    SignalEntityLeftSpace    = "ENTITY_LEFT_SPACE"
    SignalEntityEnteredZone  = "ENTITY_ENTERED_ZONE"
    SignalEntityLeftZone     = "ENTITY_LEFT_ZONE"
    SignalDwellThreshold     = "DWELL_THRESHOLD_EXCEEDED"  // Entity stayed too long
    SignalCrowdingDetected   = "CROWDING_DETECTED"         // Zone over capacity
)
```

### Decimation Rules (Domain Config)

```json
// domains/healthcare/decimation-rules.json
{
  "movementThreshold": {
    "distance_meters": 2.0,
    "description": "Ignore movement < 2m from last position"
  },
  "zoneBoundary": {
    "enabled": true,
    "description": "Only emit on zone/space crossing"
  },
  "dwellAlerts": [
    { "entityType": "patient", "zoneType": "exit", "maxDwellSeconds": 300, "alert": "PATIENT_WANDERING" },
    { "entityType": "asset", "zoneType": "sterile", "maxDwellSeconds": 3600, "alert": "EQUIPMENT_TIMEOUT" }
  ],
  "crowdingThresholds": {
    "waiting_area": 1.5,
    "patient_room": 1.0
  }
}
```

---

## API Integration Schemas

### 1. Cisco Spaces Firehose API (Location Intelligence)

**DeviceLocationUpdate** - Primary trigger for space automation:
```json
{
  "recordUid": "event-12345678-abcd-efgh-ijkl-9876543210",
  "recordTimestamp": 1678886400000,
  "eventType": "DEVICE_LOCATION_UPDATE",
  "spacesTenantId": "org-uuid-value",
  "deviceLocationUpdate": {
    "device": {
      "macAddress": "00:11:22:33:44:55",
      "manufacturer": "Apple, Inc.",
      "deviceType": "CLIENT",
      "ipAddress": "10.20.30.40"
    },
    "location": {
      "mapId": "map-uuid-floor-3",
      "mapHierarchyString": "Campus > Hospital Main > Floor 3",
      "floorId": "floor-uuid-value",
      "zoneId": "zone-uuid-trauma-room-1",
      "xCoordinate": 150.5,
      "yCoordinate": 300.2,
      "unit": "FEET",
      "confidenceFactor": 95,
      "isStale": false
    },
    "lastSeen": 1678886395000,
    "detectingAp": {
      "macAddress": "AA:BB:CC:DD:EE:FF",
      "name": "AP-Floor3-Hallway",
      "rssi": -65,
      "band": "5GHz"
    }
  }
}
```

**IoTTelemetry** - Asset sensors (temperature, button press, etc.):
```json
{
  "recordUid": "event-4438fcf3-...",
  "recordTimestamp": 1731894987730,
  "eventType": "IOT_TELEMETRY",
  "iotTelemetry": {
    "deviceInfo": {
      "deviceType": "IOT_BLE_DEVICE",
      "deviceId": "c7:1f:2c:0f:bc:41",
      "vendor": "Kontakt.io"
    },
    "telemetryData": {
      "temperature": { "value": 22.5, "unit": "CELSIUS" },
      "humidity": { "value": 45, "unit": "PERCENTAGE" },
      "batteryLevel": 88,
      "buttonPressed": false
    }
  }
}
```

**Identity Association** (MAC → Patient/Staff):
```json
{
  "macAddress": "00:11:22:33:44:55",
  "userProfile": {
    "userId": "PATIENT_12345",
    "firstName": "John",
    "lastName": "Doe",
    "role": "Patient",
    "metaData": {
      "visitId": "VISIT_9876",
      "assignedRoom": "101"
    }
  }
}
```

---

### 2. Honeywell Forge API (Environmental Control)

**Read Point Value:**
```json
{
  "id": "point-uuid-vav-101-temp",
  "name": "VAV_101_Room_Temp",
  "resourceType": "Point",
  "currentValue": {
    "value": 72.5,
    "unit": "Fahrenheit",
    "timestamp": "2025-10-27T10:00:00Z",
    "status": "Ok"
  },
  "assetId": "asset-uuid-room-101",
  "pointType": "AnalogInput"
}
```

**Write Setpoint** (HVAC control):
```json
{
  "command": "WRITE_VALUE",
  "pointId": "point-uuid-vav-101-setpoint",
  "value": {
    "numericValue": 68.0,
    "unit": "Fahrenheit"
  },
  "priority": 8,
  "duration": {
    "value": 60,
    "unit": "MINUTES"
  },
  "comment": "Automated adjustment via Cisco Spaces Occupancy Agent"
}
```

| Parameter | Purpose | Safety Implication |
|-----------|---------|-------------------|
| `priority` | BACnet Priority Array (1-16) | 8 = operator override, yields to life-safety (1/2) |
| `duration` | Command validity | Fail-safe: reverts to schedule if middleware crashes |
| `numericValue` | Target setpoint | Must validate against clinical safety ranges |

---

### 3. LenelS2 OpenAccess API (Physical Security)

**Access Event** (door forced, access denied, etc.):
```json
{
  "type_name": "Lnl_IncomingEvent",
  "property_value_map": {
    "ID": 43,
    "Description": "Door Forced Open",
    "Timestamp": "2025-10-27T10:05:00Z",
    "HardwareID": "reader-uuid-main-entry",
    "CardholderID": null,
    "EventCode": 1024,
    "PanelID": 10,
    "ReaderID": 4
  }
}
```

**Lock Door Command:**
```json
{
  "type_name": "Lnl_Reader",
  "method_name": "ExecuteReaderFunction",
  "in_parameter_value_map": {
    "ReaderID": "4",
    "PanelID": "10",
    "Function": "LOCK",
    "Duration": 0,
    "Priority": 1
  },
  "session_token": "auth-token-12345",
  "application_id": "middleware-app-id"
}
```

**Safety constraint:** NEVER send LOCK to fire exits during active Fire Alarm.

---

### 4. HL7 FHIR R4 (Clinical Data)

**DocumentReference** (Discharge Summary):
```json
{
  "resourceType": "DocumentReference",
  "status": "current",
  "docStatus": "preliminary",
  "type": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "18842-5",
        "display": "Discharge Summary"
      }
    ]
  },
  "subject": {
    "reference": "Patient/example-patient-id-123"
  },
  "context": {
    "encounter": [
      { "reference": "Encounter/example-visit-id-456" }
    ],
    "period": {
      "start": "2025-10-25T08:00:00Z",
      "end": "2025-10-27T11:00:00Z"
    }
  },
  "content": [
    {
      "attachment": {
        "contentType": "text/plain",
        "data": "base64-encoded-content"
      }
    }
  ],
  "description": "Automated draft based on location and vitals data"
}
```

**Critical fields:**
- `docStatus: "preliminary"` - AI drafts MUST be preliminary (physician signs to finalize)
- `type.code: "18842-5"` - LOINC code for Discharge Summary (ensures correct EHR indexing)
- `context.encounter` - Links to specific hospital stay (not patient's lifetime record)

---

### 5. NVIDIA NIM Tool Calling (AI Agent Actions)

**Tool Definition** (in system prompt):
```json
{
  "type": "function",
  "function": {
    "name": "lock_door",
    "description": "Locks a specific door via LenelS2 Access Control when a security threat is detected.",
    "parameters": {
      "type": "object",
      "properties": {
        "door_id": {
          "type": "string",
          "description": "The unique UUID of the reader/door."
        },
        "reason": {
          "type": "string",
          "description": "The reason for the lock action, for logging purposes."
        }
      },
      "required": ["door_id", "reason"]
    }
  }
}
```

**Agent Response** (structured output):
```json
{
  "id": "call_abc123",
  "type": "function",
  "function": {
    "name": "lock_door",
    "arguments": "{\"door_id\": \"reader-uuid-main-entry\", \"reason\": \"Staff panic button activated in Zone B\"}"
  }
}
```

---

### Database Architecture Decision

| Feature | PostgreSQL (TimescaleDB) | Firebase (Firestore) | Decision |
|---------|--------------------------|----------------------|----------|
| **Ingestion Rate** | Millions/sec with partitioning | Costs scale linearly | **Postgres** for Firehose |
| **Complex Queries** | Joins across Location + Clinical + Building | NoSQL limitations | **Postgres** for analytics |
| **Data Integrity** | ACID compliant | Eventual consistency | **Postgres** for state |
| **Real-Time Sync** | Requires add-ons | Native | **Firebase** for dashboards only |
| **HIPAA** | Self-hosted BAA | Complex exclusions | **Postgres** for compliance |

**Architecture:**
- **PostgreSQL** = Source of Truth + Firehose ingestion
- **Redis** = Ephemeral XState snapshots
- **Firebase** = Read-only mirror for staff dashboards (sanitized subset)

---

## XState Persistence (Survive Restarts)

XState actors must persist their state to Postgres so they survive server restarts.

```typescript
// services/orchestrator/src/persistence/snapshotStore.ts
import { Pool } from 'pg';

export class PostgresSnapshotStore implements ISnapshotStore {
  constructor(private pool: Pool) {}

  async save(actorId: string, snapshot: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO xstate_snapshots (actor_id, snapshot, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (actor_id) DO UPDATE SET snapshot = $2, updated_at = NOW()`,
      [actorId, JSON.stringify(snapshot)]
    );
  }

  async load(actorId: string): Promise<unknown | null> {
    const result = await this.pool.query(
      `SELECT snapshot FROM xstate_snapshots WHERE actor_id = $1`,
      [actorId]
    );
    return result.rows[0]?.snapshot ?? null;
  }
}

// Usage in orchestrator
async function getOrCreateActor(spaceId: string, config: SpaceMachineConfig) {
  const store = container.get<ISnapshotStore>(TYPES.SnapshotStore);
  const existingSnapshot = await store.load(`space:${spaceId}`);

  const machine = createSpaceMachine(config);
  const actor = createActor(machine, {
    snapshot: existingSnapshot ?? undefined,  // Resume from saved state
  });

  // Persist on every state change
  actor.subscribe((state) => {
    store.save(`space:${spaceId}`, actor.getPersistedSnapshot());
  });

  actor.start();
  return actor;
}
```

**Table schema:**
```sql
CREATE TABLE xstate_snapshots (
  actor_id VARCHAR(255) PRIMARY KEY,
  snapshot JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_updated ON xstate_snapshots(updated_at);
```

---

## Anemic Domain Model Pattern

**Key principle:** Entities are pure data (Zod schemas). Zero methods, zero behavior. All logic in services.

```typescript
// CORRECT - Anemic entity (pure data)
export const SpaceSchema = z.object({
  id: SpaceId,           // Branded type
  name: z.string(),
  zoneId: ZoneId,
  status: z.string(),    // Generic - domain config defines valid values
  metadata: z.record(z.unknown()),
});
export type Space = z.infer<typeof SpaceSchema>;

// WRONG - Rich domain model (has behavior)
class Space {
  constructor(private data: SpaceData) {}
  isOccupied(): boolean { return this.data.occupancy > 0; }  // NO!
  clean(): void { this.data.status = 'CLEAN'; }               // NO!
}
```

**Where logic lives:**
| Concern | Location | Example |
|---------|----------|---------|
| Validation | Zod schema refinements | `z.string().min(1)` |
| Business rules | Injectable services | `SpaceService.transitionState()` |
| State transitions | XState machines | `space.machine.ts` |
| Domain-specific rules | Config files | `domains/healthcare/safety-rules.json` |

---

## Phase 1: Foundation (Generic Core)

### 1.1 Create Domain-Agnostic Entities

**New file: `packages/core/src/entities/Space.ts`**
```typescript
import { z } from 'zod';

// Branded types for type safety
export const SpaceId = z.string().uuid().brand<'SpaceId'>();
export const ZoneId = z.string().uuid().brand<'ZoneId'>();

// Pure data schema - NO behavior
export const SpaceSchema = z.object({
  id: SpaceId,
  externalId: z.string().optional(),        // External system ID (Cisco, Honeywell)
  name: z.string(),
  zoneId: ZoneId,
  spaceType: z.string(),                    // Domain config defines: 'patient_room', 'guest_room', 'bay'
  status: z.string(),                       // Domain config defines valid states
  capacity: z.number().int().nonnegative(),
  currentOccupancy: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()),          // Domain-specific data lives here
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Space = z.infer<typeof SpaceSchema>;
```

**New file: `packages/core/src/entities/Entity.ts`**
```typescript
// Represents any trackable thing: person, asset, device
export const EntitySchema = z.object({
  id: EntityId,
  externalId: z.string().optional(),        // Badge ID, device MAC, etc.
  entityType: z.string(),                   // Domain defines: 'staff', 'patient', 'guest', 'asset'
  name: z.string(),
  currentZoneId: ZoneId.nullable(),
  currentSpaceId: SpaceId.nullable(),
  lastSeenAt: z.date().nullable(),
  status: z.string(),                       // Domain defines valid values
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Entity = z.infer<typeof EntitySchema>;
```

**Additional generic entities:** `Zone.ts`, `Workflow.ts`, `Alert.ts`, `Event.ts`

### 1.2 Create Service Interfaces

**New file: `packages/core/src/interfaces/ILocationService.ts`**
```typescript
export interface ILocationService {
  getDeviceLocation(deviceId: string): Promise<LocationEvent | null>;
  getZoneOccupancy(zoneId: string): Promise<{ staffCount: number; patientCount: number }>;
  subscribeToZone(zoneId: string, callback: (event: LocationEvent) => void): () => void;
}
```

**Additional interfaces:** `IAccessService.ts`, `IHVACService.ts`, `IFHIRClient.ts`, `IClinicalAI.ts`

### 1.3 Go Microservice for Cisco Spaces Firehose

**New directory: `services/location-ingestion/`**

```go
// cmd/server/main.go
func main() {
    client := firehose.NewClient(os.Getenv("CISCO_SPACES_URL"), os.Getenv("CISCO_API_KEY"))
    publisher := pubsub.NewPublisher(os.Getenv("GCP_PROJECT"), "location-events")

    ctx := context.Background()
    client.Connect(ctx)

    for event := range client.Events() {
        enriched := transformer.Enrich(event)
        publisher.Publish(ctx, enriched)
    }
}
```

**Key packages:**
- `internal/firehose/` - WebSocket client with reconnection
- `internal/publisher/` - GCP Pub/Sub publisher
- `internal/transformer/` - Device ID → Staff/Patient resolution

---

## Phase 2: Space Automation (Generic State Machine)

### 2.1 Generic Space State Machine

**New file: `packages/core/src/machines/space.machine.ts`**

Generic states loaded from domain config. Machine is parameterized, not hardcoded:

```typescript
// Generic machine factory - states come from config
export function createSpaceMachine(config: SpaceMachineConfig) {
  return setup({
    types: {
      context: {} as SpaceContext,
      events: {} as SpaceEvent,
    },
    actors: {
      // Generic actor stubs - implementations injected at runtime
      notifyService: fromPromise(async ({ input }) => { throw new Error('Inject impl'); }),
      controlEnvironment: fromPromise(async ({ input }) => { throw new Error('Inject impl'); }),
      controlAccess: fromPromise(async ({ input }) => { throw new Error('Inject impl'); }),
    },
  }).createMachine({
    id: 'space',
    initial: config.initialState,
    states: config.states,  // Loaded from domains/healthcare/workflows.json
  });
}
```

**Domain config: `domains/healthcare/workflows.json`**
```json
{
  "spaceMachine": {
    "initialState": "occupied",
    "states": {
      "occupied": { "on": { "ENTITY_LEFT": "dirty" } },
      "dirty": { "on": { "CLEANING_STARTED": "cleaning" }, "entry": ["notifyES", "lockAccess"] },
      "cleaning": { "on": { "CLEANING_COMPLETED": "pendingInspection" } },
      "pendingInspection": { "on": { "INSPECTION_PASSED": "clean", "INSPECTION_FAILED": "cleaning" } },
      "clean": { "on": { "ENTITY_ENTERED": "occupied" }, "entry": ["unlockAccess"] }
    },
    "entityMapping": { "PATIENT_DISCHARGED": "ENTITY_LEFT", "PATIENT_ADMITTED": "ENTITY_ENTERED" }
  }
}
```

**Hospitality domain would use different config:**
```json
{
  "spaceMachine": {
    "initialState": "vacant",
    "states": {
      "occupied": { "on": { "GUEST_CHECKED_OUT": "dirty" } },
      "dirty": { "on": { "HOUSEKEEPER_ARRIVED": "cleaning" } },
      ...
    }
  }
}
```

### 2.2 Service Layer (All Business Logic Here)

**New file: `packages/infrastructure/src/services/SpaceService.ts`**
```typescript
@injectable()
export class SpaceService implements ISpaceService {
  constructor(
    @inject(TYPES.SpaceRepository) private repo: ISpaceRepository,
    @inject(TYPES.DomainConfig) private config: IDomainConfig,
    @inject(TYPES.EventBus) private events: IEventBus,
  ) {}

  // ALL business logic in services, not entities
  async transitionState(spaceId: SpaceId, event: string): Promise<Space> {
    const space = await this.repo.findById(spaceId);
    const machine = createSpaceMachine(this.config.spaceMachine);
    const actor = createActor(machine, { snapshot: space.metadata.xstateSnapshot });

    actor.send({ type: event });
    const newState = actor.getSnapshot().value;

    return this.repo.update(spaceId, {
      status: newState,
      metadata: { ...space.metadata, xstateSnapshot: actor.getPersistedSnapshot() }
    });
  }
}
```

### 2.2 External Integrations

**New file: `packages/infrastructure/src/external/HoneywellForgeClient.ts`**
```typescript
@injectable()
export class HoneywellForgeClient implements IHVACService {
  async setRoomMode(roomId: string, mode: 'normal' | 'purge' | 'unoccupied') {
    // POST to Honeywell Forge API with thermostat setpoint
  }
  async triggerAirPurge(roomId: string, durationMinutes: number) {
    // Increase air changes for post-discharge purge
  }
}
```

**New file: `packages/infrastructure/src/external/LenelS2Client.ts`**
```typescript
@injectable()
export class LenelS2Client implements IAccessControlService {
  async lockZone(zoneId: string, allowedBadges: string[]) {
    // POST /api/access/onguard/openaccess/execute_action
  }
}
```

---

## Phase 3: Clinical Documentation (FHIR + NIM)

### 3.1 NVIDIA NIM Adapter

**New file: `packages/infrastructure/src/ai/NVIDIANIMAdapter.ts`**

Pattern: Follow `GeminiFlashChatAndUploadsAdapter.ts` structure
- Implement `IClinicalAI`, `IStreamingClinicalAI`
- Support streaming via SSE
- Use `meta/llama-3.1-70b-instruct` model
- JSON schema output for structured clinical documents

### 3.2 FHIR Client

**New file: `packages/infrastructure/src/fhir/EpicFHIRAdapter.ts`**
```typescript
@injectable()
export class EpicFHIRAdapter implements IFHIRClient {
  async getPatient(patientId: string): Promise<FHIRPatient>;
  async getPatientEncounters(patientId: string): Promise<FHIREncounter[]>;
  async submitDocumentReference(doc: FHIRDocumentReference): Promise<string>;
}
```

### 3.3 Clinical Document Workflow Machine

**New file: `packages/core/src/machines/clinicalDoc.machine.ts`**

States: `idle` → `fetchingFHIRData` → `generatingDraft` → `pendingReview` → `pendingSignature` → `submitting` → `completed`

Human-in-the-loop: AI generates draft, physician reviews and signs

---

## Phase 4: Staff Presence & Alerts

### 4.1 Alert State Machine

**New file: `packages/core/src/machines/alert.machine.ts`**

States: `active` → `acknowledged` → `resolved` | `escalated`

Alert types:
- `PANIC_BUTTON` - Emergency
- `ZONE_VIOLATION` - Unauthorized access
- `ROOM_TURNOVER_OVERDUE` - Cleaning SLA breach
- `PATIENT_WANDERING` - Elopement risk

### 4.2 Real-time Staff Dashboard

Update `src/app/dashboard/` with:
- Staff location map
- Active alerts panel
- Room status board

---

## Critical Files Reference

| Current File | Action | New File |
|--------------|--------|----------|
| `packages/core/src/machines/mechanic.machine.ts` | Pattern source | `room.machine.ts`, `clinicalDoc.machine.ts` |
| `packages/infrastructure/src/di/container.ts` | Preserve & adapt | Same file, new bindings |
| `packages/infrastructure/src/ai/GeminiFlashChatAndUploadsAdapter.ts` | Pattern source | `NVIDIANIMAdapter.ts` |
| `packages/infrastructure/src/services/ReactiveSafetyService.ts` | Adapt rules | `ClinicalReactiveSafetyService.ts` |
| `packages/core/src/types/ai.ts` | Preserve streaming | Same file |

---

## Domain Configuration System

### How domains are loaded:

```typescript
// packages/infrastructure/src/di/domainLoader.ts
export function loadDomainConfig(domain: 'healthcare' | 'hospitality' | 'logistics'): DomainConfig {
  return {
    entityTypes: require(`../../../domains/${domain}/config`).entityTypes,
    spaceTypes: require(`../../../domains/${domain}/config`).spaceTypes,
    workflows: require(`../../../domains/${domain}/workflows.json`),
    safetyRules: require(`../../../domains/${domain}/safety-rules.json`),
    prompts: require(`../../../domains/${domain}/prompts`),
  };
}

// DI container binds domain at startup
container.bind<DomainConfig>(TYPES.DomainConfig)
  .toDynamicValue(() => loadDomainConfig(process.env.DOMAIN as any));
```

### Healthcare domain config example:

```typescript
// domains/healthcare/config.ts
export const entityTypes = {
  staff: { label: 'Staff', icon: 'user-md', trackable: true },
  patient: { label: 'Patient', icon: 'bed', trackable: true },
  visitor: { label: 'Visitor', icon: 'user', trackable: false },
  asset: { label: 'Equipment', icon: 'stethoscope', trackable: true },
};

export const spaceTypes = {
  patient_room: { label: 'Patient Room', turnoverRequired: true },
  or: { label: 'Operating Room', turnoverRequired: true, isolationDefault: 'sterile' },
  waiting: { label: 'Waiting Area', turnoverRequired: false },
};

export const statusValues = {
  space: ['CLEAN', 'OCCUPIED', 'DIRTY', 'CLEANING', 'MAINTENANCE', 'OUT_OF_SERVICE'],
  entity: ['on_duty', 'off_duty', 'break', 'emergency'],
};
```

---

## Mock Server & Testing Strategy

### Why Mock?

Development and testing requires simulation of the Cisco Spaces Firehose without access to production hospital networks. The mock server acts as the "digital twin" of the operational model.

### Mock Server Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MOCK TESTING ENVIRONMENT                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ Python Mock      │    │  Mock Downstream │                       │
│  │ Stream Generator │    │  APIs            │                       │
│  │ (Firehose)       │    │  • ServiceNow    │                       │
│  └────────┬─────────┘    │  • Honeywell     │                       │
│           │              │  • Webex         │                       │
│           │              │  • FHIR          │                       │
│           ▼              └────────▲─────────┘                       │
│  ┌─────────────────────────────────┐                                │
│  │      MIDDLEWARE UNDER TEST      │───── Outbound calls verified   │
│  │  (Go Ingestion + XState Logic)  │                                │
│  └─────────────────────────────────┘                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Simulation Tenants

Toggle between domain profiles via `SIMULATION_TENANT` env var:

| Tenant | Zone Examples | Personas | Use Case |
|--------|---------------|----------|----------|
| `healthcare` | ER, Triage, Room 101, Pharmacy | Doctor_Smith, Patient_Doe | Hospital workflows |
| `hospitality` | Lobby, Room 405, Pool, Restaurant | Guest_Jones, Housekeeper_Lee | Hotel workflows |
| `logistics` | Bay 1, Staging, Cold Storage | Worker_Garcia, Forklift_01 | Warehouse workflows |

### Mock Event Schemas

**Device Location Update** (movement trigger):
```json
{
  "recordUid": "event-531fbf9c-1234-5678",
  "recordTimestamp": 1672531200000,
  "eventType": "DEVICE_LOCATION_UPDATE",
  "spacesTenantId": "spaces-tenant-549be59d",
  "partnerTenantId": "Simulation-Healthcare",
  "deviceLocationUpdate": {
    "device": {
      "deviceId": "device-hViL1d1XZkuivw7qsdXY",
      "macAddress": "00:50:54:AD:F1:00",
      "deviceClassification": "Infusion Pump",
      "userId": "user-wSwVfxQbHbb3Gn49VNSrZ"
    },
    "location": {
      "locationId": "location-ad0a997",
      "name": "Trauma Room B",
      "floorNumber": 2,
      "xPos": 683.626,
      "yPos": 154.978,
      "confidenceFactor": 0.95
    },
    "visitId": "visit-7940552674721688144"
  }
}
```

**Device Count** (occupancy trigger):
```json
{
  "recordUid": "event-presence-9912",
  "eventType": "DEVICE_COUNT",
  "deviceCount": {
    "locationId": "location-ad0a997",
    "timestamp": 1672531210000,
    "count": 0,
    "deviceTypeCounts": {
      "CLIENT": 0,
      "TAG": 2
    }
  }
}
```

**Keep-Alive** (connection health):
```json
{
  "recordUid": "keepalive-001",
  "eventType": "KEEP_ALIVE",
  "timestamp": 1672531225000
}
```
- Sent every 15 seconds if no other events
- Mock must implement to test connection recovery

### Scenario-Based Testing

#### Scenario 1: Room Turnover Automation

```
T=0s      DeviceCount { locationId: "room-101", count: 2 }  → State: OCCUPIED
T=15m     DeviceCount { count: 2 } (sustained)               → State: OCCUPIED
T=16m     DeviceLocationUpdate { patient → hallway }         → Trigger pending
T=16m10s  DeviceCount { count: 0 }                           → Guard timer starts
T=16m30s  IoTTelemetry { motion: false }                     → Confirmation
T=17m10s  Guard timer expires (60s)                          → State: DIRTY

Expected Actions:
  ✓ POST ServiceNow /api/now/table/incident (cleaning ticket)
  ✓ POST Webex /v1/messages (alert housekeeping)
  ✓ POST Honeywell Forge (HVAC purge mode)
```

#### Scenario 2: Staff Panic Button

```
T=0s      IoTTelemetry { buttonPressed: true, deviceId: "badge-nurse-jane" }
T=0s      DeviceLocationUpdate { badge-nurse-jane → zone-ER-1 }

Expected Actions (within 5s):
  ✓ POST LenelS2 /api/access/.../execute_action { Function: "LOCK", zoneId: "zone-ER-1" }
  ✓ POST Webex /v1/messages { Adaptive Card with "Acknowledge" button }
  ✓ GET nearest security staff via Cisco Spaces
  ✓ POST Webex to security with location + camera snapshot
```

#### Scenario 3: Auto-Discharge Documentation

```
T=0s      DeviceLocationUpdate { patient → "Discharge Lobby" }
T=1s      Mock FHIR returns patient encounters, observations, medications
T=2s      Mock NIM returns generated discharge summary
T=3s      Middleware calls FHIR DocumentReference.Create

Expected Payload to FHIR:
{
  "resourceType": "DocumentReference",
  "docStatus": "preliminary",  ← MUST be preliminary (AI draft)
  "type": { "coding": [{ "code": "18842-5" }] }  ← LOINC discharge summary
}
```

### Downstream API Mocks

#### ServiceNow Incident Creation
```json
// Request: POST /api/now/table/incident
{
  "short_description": "Freezer_04 Temperature Alert: 10C",
  "description": "Critical temperature threshold breached. Sensor ID: c7:1f:2c...",
  "category": "Hardware",
  "impact": "1",
  "urgency": "1",
  "assignment_group": "Facilities_Maintenance"
}

// Response
{
  "result": {
    "number": "INC0010042",
    "sys_id": "9c573167c61122870020",
    "state": "New"
  }
}
```

#### Webex Adaptive Card
```json
// Request: POST /v1/messages
{
  "roomId": "Y2lzY...",
  "text": "Security Alert: Unauthorized Access",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": {
      "type": "AdaptiveCard",
      "body": [{ "type": "TextBlock", "text": "Zone B - Door Forced" }],
      "actions": [{ "type": "Action.Submit", "title": "Acknowledge" }]
    }
  }]
}
```

### Python Mock Stream Generator

```python
# services/mock-server/stream_generator.py
import json
import time
import uuid
from typing import Generator

def generate_location_update(device_id: str, zone_id: str, zone_name: str) -> dict:
    return {
        "recordUid": str(uuid.uuid4()),
        "recordTimestamp": int(time.time() * 1000),
        "eventType": "DEVICE_LOCATION_UPDATE",
        "partnerTenantId": "Simulation-Healthcare",
        "deviceLocationUpdate": {
            "device": {"deviceId": device_id, "deviceClassification": "Staff Badge"},
            "location": {"locationId": zone_id, "name": zone_name, "confidenceFactor": 0.95}
        }
    }

def generate_device_count(zone_id: str, count: int) -> dict:
    return {
        "recordUid": str(uuid.uuid4()),
        "recordTimestamp": int(time.time() * 1000),
        "eventType": "DEVICE_COUNT",
        "deviceCount": {"locationId": zone_id, "count": count}
    }

def stream_firehose() -> Generator[str, None, None]:
    """Simulates Cisco Spaces Firehose - newline-delimited JSON"""
    last_event = time.time()
    while True:
        # Send keep-alive every 15s if no events
        if time.time() - last_event > 15:
            yield json.dumps({"eventType": "KEEP_ALIVE", "timestamp": int(time.time() * 1000)}) + "\n"
            last_event = time.time()

        # Generate random events
        yield json.dumps(generate_location_update("device-123", "zone-ER-1", "ER Waiting")) + "\n"
        last_event = time.time()
        time.sleep(0.1)  # 10 events/sec
```

### Synthetic Data Generation

| Data Type | Library/Method | Purpose |
|-----------|----------------|---------|
| Names/PII | Faker (Python) | Generate realistic but fake identities |
| MAC Addresses | Random hex | Device identifiers |
| Movement | Random walk algorithm | Natural-looking xPos/yPos changes |
| Telemetry | Gaussian + threshold breach | Temperature fluctuations with anomalies |
| UUIDs | uuid4() | Event and device IDs |

### Test Tooling Stack

| Component | Tool | Rationale |
|-----------|------|-----------|
| Mock HTTP Server | Mockoon / FastAPI | Easy routing + dynamic templating |
| Stream Generator | Python yield | Infinite newline-delimited JSON |
| Database (Test) | TimescaleDB (Docker) | Matches production ingestion |
| XState Testing | Vitest + XState test utils | State machine transition verification |
| API Assertions | Supertest / httpx | Verify outbound payloads |

---

## Implementation Order

1. **Week 1-2**: Generic core entities + interfaces + retire automotive code
2. **Week 3**: Go microservice scaffold + **Python mock server** (Firehose simulation)
3. **Week 4**: Generic space.machine.ts factory + domain config loader
4. **Week 5-6**: Honeywell + LenelS2 integration adapters + **downstream API mocks**
5. **Week 7-8**: NVIDIA NIM adapter + healthcare domain config
6. **Week 9-10**: Workflow automation service layer + **scenario-based tests**
7. **Week 11-12**: Alert system + entity tracking
8. **Week 13+**: Production hardening + **integration testing with real APIs**

---

## First Steps (Immediate)

1. **Create generic entities** at `packages/core/src/entities/`:
   - `Space.ts` (with branded SpaceId)
   - `Entity.ts` (with branded EntityId)
   - `Zone.ts`, `Alert.ts`, `Workflow.ts`

2. **Create service interfaces** at `packages/core/src/interfaces/`:
   - `ISpaceService.ts`, `IEntityService.ts`
   - `ILocationService.ts`, `IAccessService.ts`, `IEnvironmentService.ts`
   - `IAIService.ts` (generic, not clinical-specific)

3. **Create domain config structure** at `domains/`:
   - `domains/healthcare/config.ts`
   - `domains/healthcare/workflows.json`
   - `domains/healthcare/safety-rules.json`

4. **Delete automotive-specific files**:
   - `mechanic.machine.ts`, `MechanicReasoningService.ts`
   - `MechanicPrompts.ts`, `VideoPrompts.ts` (automotive ones)
   - Vehicle entities and NHTSA integrations

5. **Initialize Go module** at `services/ingestion/`

6. **Create Python mock server** at `services/mock-server/`:
   - `stream_generator.py` - Firehose event generator
   - `downstream_mocks.py` - ServiceNow, Honeywell, Webex, FHIR mocks
   - `scenarios/` - Room turnover, panic button, auto-discharge test scripts

7. **Create generic space.machine.ts** factory that loads states from config
