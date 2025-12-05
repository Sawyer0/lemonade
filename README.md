# Lemonade MVP

AI-powered vehicle diagnostic platform. A "Master Technician" in your pocket.

# CONFIDENTIAL - PROPRIETARY SOFTWARE

---

## Overview

Lemonade provides accurate, safe, and instant mechanical diagnostics via video and chat. The platform uses Google's Gemini 2.5 Flash with thinking budget for deep reasoning and real-time assistance.

**Core Philosophy**: Safety First, Accuracy Second, Speed Third.

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Framework  | Next.js 15 (App Router)             |
| Language   | TypeScript (Strict Mode)            |
| Database   | Firebase Firestore                  |
| Auth       | Firebase Authentication (Google)    |
| Storage    | Google Cloud Storage                |
| AI         | Google Vertex AI (Gemini 2.5 Flash) |
| Deployment | Google Cloud Run                    |

## Prerequisites

- Node.js 20+
- npm 10+
- Google Cloud Project with:
  - Vertex AI API enabled
  - Firebase project configured
  - Cloud Storage bucket
- Firebase Service Account Key (JSON)

## Environment Setup

Create `.env.local` in the project root:

```env
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin (Server)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Google Cloud
GCLOUD_PROJECT=your_project_id
GCLOUD_MEDIA_BUCKET=your_bucket.firebasestorage.app

# Stripe (Payments)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# LangSmith (AI Observability)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_key
LANGCHAIN_PROJECT=lemonade-master-tech
```

## Installation

```bash
# Install dependencies
npm install

# Install Firebase Functions dependencies
cd functions && npm install && cd ..
```

## Development

```bash
# Start development server
npm run dev

# Run linting
npm run lint

# Run tests
npx vitest run

# Build for production
npm run build
```

## Project Structure

```
src/
├── core/                 # Domain layer (no external deps)
│   ├── entities/         # Business entities (Vehicle, Session)
│   ├── interfaces/       # Contracts (IRepository, IAIService)
│   ├── prompts/          # AI system prompts by domain
│   ├── tools/            # AI tool definitions (webSearch, openCamera)
│   └── types/            # Zod schemas
├── infrastructure/       # Implementation layer
│   ├── ai/               # Gemini adapters
│   ├── di/               # Dependency injection container
│   ├── firebase/         # Firebase config & admin
│   └── repositories/     # Firestore implementations
├── application/          # Business logic services
│   └── services/         # DiagnosticService, VehicleService
├── presentation/         # UI layer
│   ├── components/       # React components
│   └── hooks/            # Custom hooks (useLiveSession, etc.)
└── app/                  # Next.js App Router
    └── api/              # API routes
```

## Architecture

The application follows a strict layered architecture with InversifyJS for dependency injection:

1. **Core** → Pure domain logic, no framework dependencies
2. **Infrastructure** → External integrations (Firebase, Vertex AI)
3. **Application** → Business logic orchestration
4. **Presentation** → React UI components

See `docs/LEMONADE-ARCHITECTURE.md` for detailed documentation.

### High-Level Architecture Diagram

```mermaid
flowchart TD
  %% Layers
  subgraph Client[Client]
    Browser[User Browser]
  end

  subgraph NextJS[Next.js App Router\nsrc/app, src/presentation]
    AuthUI[Auth / Landing]
    Garage[Garage / Vehicles]
    Session[Session Workspace]
  end

  subgraph DI[Inversify DI Container\nsrc/infrastructure/di]
    Types[Bindings & Types]
  end

  subgraph App[Application Layer\nsrc/application/services]
    DS[DiagnosticService]
    VS[VehicleService]
  end

  subgraph Infra[Infrastructure Layer\nsrc/infrastructure]
    Repos[Firestore Repositories\nSession / Vehicle]
    Firebase[Firebase Admin & Auth]
    Vertex[Vertex AI Adapters\nGeminiProAdapter / GeminiFlashAdapter]
    Storage[StorageService\nGCS Signed URLs]
  end

  subgraph GCP[Backend Services]
    GCS[(Cloud Storage)]
    FFVideo[Cloud Function\nanalyzeUploadedVideo]
    FFPay[Cloud Function\nStripe payments]
    Firestore[(Firestore)]
    Stripe[(Stripe)]
    NHTSA[(NHTSA API)]
  end

  %% Layer wiring
  Browser --> NextJS
  NextJS --> DI --> App --> Infra

  %% Video upload → AI analysis → real-time UI
  Session -->|upload video| Storage
  Storage -->|signed URL write| GCS
  GCS -->|onObjectFinalized| FFVideo
  FFVideo -->|call Gemini 2.5 Flash| Vertex
  FFVideo -->|update analysis| Firestore
  Firestore -->|onSnapshot| Session

  %% Safety & tools (function calling)
  Session -->|chat / voice| DS
  DS --> Vertex
  Vertex -->|tools: verifySafeSupport, openCamera, webSearch| Session

  %% Vehicle onboarding (VIN scan)
  Garage --> VS
  VS --> Repos
  VS --> NHTSA

  %% Auth & user context
  AuthUI --> Firebase --> Firestore

  %% Billing and Pro tier gating
  Garage -->|Upgrade to Pro| Stripe
  Stripe --> FFPay --> Firestore
  Firestore -->|user tier| NextJS
```

### Tool-Calling & Camera Flow

```mermaid
sequenceDiagram
    autonumber

    participant U as User
    participant UI as Session Workspace<br/>(CameraWorkspace / ChatStream)
    participant API as Next.js API Routes
    participant DS as DiagnosticService
    participant GX as GeminiFlashAdapter
    participant GXModel as Gemini 2.5 Flash
    participant Tools as Tools<br/>(verifySafeSupport, openCamera, webSearch)
    participant Cam as CameraView
    participant GCS as Cloud Storage
    participant FF as Cloud Function<br/>analyzeUploadedVideo
    participant FS as Firestore

    %% User starts interaction
    U->>UI: Chat / Voice message
    UI->>API: POST /api/chat or /api/voice
    API->>DS: handleChatInteraction / processVoiceCommand

    %% DiagnosticService calls Gemini through adapter
    DS->>GX: generateReply / processAudioCommand
    GX->>GXModel: send prompt + history

    %% Model decides to call tools
    GXModel-->>GX: functionCall(openCamera / verifySafeSupport / webSearch)
    GX-->>UI: Tool invocation metadata

    %% Camera tool path
    UI->>Cam: Render CameraView for live capture
    U->>Cam: Point camera at target area
    Cam->>GCS: Upload captured image/video
    GCS-->>FF: onObjectFinalized trigger (optional video pipeline)
    FF->>FS: Update session analysis / safety fields

    %% Safety verification tool path
    GXModel-->>Tools: verifySafeSupport(reason, required_equipment)
    Tools-->>GXModel: safety result (safe / unsafe, concerns, recommendation)
    GXModel-->>GX: final assistant message
    GX-->>DS: reply text + safety state
    DS->>FS: append messages / safety flags
    FS-->>UI: onSnapshot live update

    %% Web search tool path
    GXModel-->>Tools: webSearch(query, searchType)
    Tools-->>GXModel: grounded results
    GXModel-->>GX: grounded explanation
    GX-->>DS: final answer
    DS-->>API: response payload
    API-->>UI: chat response
    UI-->>U: updated chat + safety / camera UI
```

## Key Features

- **Real-time Chat** with Gemini 2.5 Flash
- **Web Search Grounding** for TSBs, recalls, torque specs
- **Video Analysis** for visual diagnostics
- **Voice Input** with VAD (Voice Activity Detection)
- **Safety Constitution** - AI governed by strict safety directives
- **Live Session Sync** via Firestore real-time listeners

## Deployment

### Docker (Cloud Run)

```bash
# Build image
docker build -t lemonade-mvp .

# Run locally
docker run -p 3000:3000 --env-file .env.local lemonade-mvp
```

### Cloud Run Deployment

```bash
# Deploy to Cloud Run
gcloud run deploy lemonade-mvp \
  --image gcr.io/PROJECT_ID/lemonade-mvp \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## Firebase Setup

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage

# Deploy Cloud Functions
firebase deploy --only functions
```

## Testing

```bash
# Run all tests
npx vitest run

# Run specific test suite
npx vitest run src/core/tools/__tests__

# Run with coverage
npx vitest run --coverage

# E2E tests (Playwright)
npx playwright test
```

## API Routes

| Endpoint                | Method | Description                      |
| ----------------------- | ------ | -------------------------------- |
| `/api/chat`             | POST   | AI chat with web search          |
| `/api/vehicles/scan`    | POST   | VIN decode & vehicle onboarding  |
| `/api/upload/sign`      | POST   | Get signed URL for direct upload |
| `/api/analysis/trigger` | POST   | Trigger video analysis           |
| `/api/stripe/checkout`  | POST   | Create Stripe checkout session   |
| `/api/stripe/portal`    | POST   | Access billing portal            |

## Security

- All API routes protected by middleware authentication
- Firebase Auth tokens validated server-side
- Firestore security rules enforce user-level access
- Service account credentials never exposed to client

## Monitoring

- **LangSmith**: AI request tracing and safety evaluations
- **Firebase Console**: Firestore usage, Auth metrics
- **Cloud Run**: Request logs, error tracking

---

**© 2025 Lemonade. All Rights Reserved.**

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.
