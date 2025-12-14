# Lemonade MVP - AI Context & Instructions

## Project Overview
Lemonade is an AI-powered vehicle diagnostic platform designed to function as a "Master Technician." It leverages Google's Gemini 2.5 Flash model for deep reasoning, real-time assistance, and multimodal analysis (video/audio).

**Core Philosophy:** Safety First, Accuracy Second, Speed Third.
**Status:** PROPRIETARY / CONFIDENTIAL.

## Technology Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (Strict Mode)
- **AI:** Google Vertex AI (Gemini 2.5 Flash), LangSmith (Observability)
- **Database:** Firebase Firestore (NoSQL)
- **Auth:** Firebase Authentication
- **Storage:** Google Cloud Storage
- **Mobile:** React Native (Expo) + WebView (Hybrid Architecture)
- **State/Data:** SWR (Client), Anemic Domain Model (Server)
- **DI:** InversifyJS

## Architecture
The project follows a strict **Feature-Sliced / Layered Architecture**:

1.  **Core (`src/core`)**: Pure domain logic, entities, interfaces, Zod schemas. *No external dependencies.*
2.  **Infrastructure (`src/infrastructure`)**: Implementations of Core interfaces (Firebase, API adapters).
3.  **Application (`src/application`)**: Business logic services. Orchestrates infrastructure.
4.  **Presentation (`src/presentation`)**: React components, Hooks.
5.  **Mobile (`mobile/`)**: React Native app for hardware access (Camera, VAD), using WebViews for complex UI.

**Key Pattern: Anemic Domain Model**
- **Data**: Pure JSON/DTOs defined in `src/core/types`. Serializable. ZERO methods.
- **Logic**: Stateless services in `src/application/services` that accept/return data.

## Development Conventions

### "Golden Rules" (from Agent.md)
1.  **NEVER Make Assumptions**: Ask if ambiguous.
2.  **Strict Separation**: Keep Data (DTOs) and Logic (Services) separate.
3.  **No "MVP" Hacks**: Write production-ready code. No `// TODO: Fix later`.
4.  **Dependency Injection**: Always use the DI container (`src/infrastructure/di/container.ts`). Never instantiate services directly.
5.  **Interface Segregation**: Define interfaces in `Core` before implementing in `Infrastructure`.
6.  **Configuration**: Access config ONLY via `src/infrastructure/config.ts`. No magic strings or direct `process.env`.
7.  **Logging**: Use `ILogger` with structured JSON and `traceId`. No `console.log`.

### Build & Run
- **Dev Server**: `npm run dev`
- **Build**: `npm run build`
- **Test**: `npx vitest run`
- **Lint**: `npm run lint`
- **Mobile**: `cd mobile && npx expo start`

## Directory Structure
- `src/app`: Next.js App Router pages and API routes.
- `src/core/entities`: Business entities (e.g., `Vehicle`, `DiagnosticSession`).
- `src/core/prompts`: System prompts for the AI.
- `src/infrastructure/firebase`: Firebase admin and client config.
- `functions/`: Firebase Cloud Functions.

## Critical Files
- `src/core/types/models.ts`: **Single Source of Truth** for Zod schemas.
- `src/infrastructure/config.ts`: Centralized configuration.
- `Agent.md`: Detailed architectural guidelines and rules.
