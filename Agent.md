# Lemonade MVP - AI Agent Development Guide

This document serves as the **Source of Truth** for any AI agent working on the Lemonade codebase. Follow these rules strictly to maintain architectural integrity and production readiness.

## 1. Project Overview
**Lemonade** is an AI-powered diagnostic platform for vehicles. It acts as a "Master Technician" in your pocket.
- **Goal**: Provide accurate, safe, and instant mechanical diagnostics via video and chat.
- **Core Philosophy**: "Safety First, Accuracy Second, Speed Third."

## 2. Technology Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS (Utility-first)
- **Database**: Firebase Firestore (NoSQL)
- **Auth**: Firebase Authentication (Google Provider)
- **Storage**: Google Cloud Storage (Direct Uploads via Signed URLs)
- **AI**: Google Vertex AI (Gemini 2.5 Flash with Thinking Budget for Video Analysis and Chat)
- **State/Fetching**: **SWR** (Stale-While-Revalidate) - *Do not use useEffect for fetching.*
- **Dependency Injection**: **InversifyJS**

## 3. Architecture: Feature-Sliced + DI
We use a strict **Layered Architecture** managed by InversifyJS.

### Layers
1.  **Core (`src/core`)**: Pure domain logic. Interfaces, Types, Zod Schemas, Constants. *No external dependencies.*
2.  **Infrastructure (`src/infrastructure`)**: Implementations of Core interfaces. Database calls, AI adapters, 3rd party APIs.
3.  **Application (`src/application`)**: Business logic services. Orchestrates Infrastructure tools to solve domain problems.
4.  **Presentation (`src/presentation`)**: React components, Hooks, Context. *Only interacts with Application Services or Hooks.*

### Dependency Injection Rules
- **NEVER** instantiate services directly (e.g., `new VehicleService()`).
- **ALWAYS** use the DI Container (`src/infrastructure/di/container.ts`).
- **ALWAYS** define an Interface in `Core` before writing an Implementation in `Infrastructure`.
- **Binding**: Bind all new services in `container.ts` using symbols from `types.ts`.

## 4. Coding Standards

### Data Fetching
- **Anti-Pattern**: Using `useEffect` to fetch data.
- **Standard**: Use **SWR** (`useSWR`) for all client-side data fetching.
  ```typescript
  const { data, error } = useSWR('/api/resource', fetcher);
  ```

### Error Handling & Logging
- **No Ad-Hoc Errors**: Never throw raw strings like `throw new Error("Something broke")`.
- **Standardization**: Always use the `AppError` class and `ErrorCode` enum from `src/core/errors`.
- **Structured Logging**: **NEVER** use `console.log` or `console.error`. Use the `ILogger` service injected via DI.
  - Logs must be structured JSON objects.
  - Include context (sessionId, userId, correlationId).
- **Reusability**: If a new error scenario arises, add a new `ErrorCode` to the enum. Do not hardcode strings.

### Validation
- **Strict Zod Schemas**: All data entering the system (API requests, Firestore reads) must be validated with Zod schemas defined in `src/core/types/models.ts`.

### Safety Constitution & Prompts
- The AI is governed by strict "Prime Directives".
- **Modular Prompts**: Do NOT store all prompts in a single file.
  - Create a directory `src/core/prompts/`.
  - Separate prompts by domain (e.g., `voice.ts`, `video.ts`, `chat.ts`).
- **Safety Stop**: If the AI detects a dangerous situation (e.g., "widowmaker" jacks), it must trigger a `safety_alert` and stop the session.
- **Never Override**: Do not weaken the safety prompts.

### API Routes
- **Secure**: All API routes must be protected by the Middleware (`src/middleware.ts`).
- **Thin Controllers**: API routes should extract params, call a Service, and return JSON. Business logic belongs in `src/application/services`.

### File Structure & Clean Code
- **Single Responsibility**: Each file should do one thing well. If a file exceeds ~200 lines, YOU MUST NOT ADD TO IT. SPLIT IT.
- **No Bloat**: Avoid "God Components" or "God Services". Refactor mixed responsibilities into helper functions, hooks, or separate components.
- **Colocation**: Keep related styles, tests, and types close to the component if possible (or follow the FSD structure).

### Component Design
- **Reusability**: Components should be designed to be reused. Avoid hardcoding business logic inside UI components; pass data via props.
- **Composition**: Build complex UIs by composing smaller, atomic components.
- **Completeness**: Do NOT leave "TODO" comments for critical UI feedback (e.g., error notifications). Implement the necessary UI patterns (e.g., Toasts) immediately.
- **No Mocks**: Do not leave "mock" implementations or comments in production code. Implement the actual logic or a proper abstraction.

## 5. Workflow for New Features
1.  **Define**: Create the Interface in `src/core/interfaces`.
2.  **Implement**: Create the Class in `src/infrastructure` or `src/application`.
3.  **Bind**: Add the Symbol to `types.ts` and bind it in `container.ts`.
4.  **Expose**: Create a Next.js API route if needed.
5.  **Consume**: Use SWR in the Frontend Component.

## 6. Environment
- **Local**: `.env.local` contains secrets.
- **Production**: Dockerized container (Cloud Run).
- **Config**: `next.config.ts` is set for `standalone` output.

---
**"Build it like a Master Tech would: Precise, Clean, and Safe."**
