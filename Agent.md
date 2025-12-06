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

### Interface Segregation (CRITICAL)
- **No God Interfaces**: Interfaces must be small and focused on a single responsibility.
- **Split by Capability**: If an interface has methods for different concerns (e.g., video + chat + voice), split it into separate interfaces.
- **Naming Convention**: Use `I{Capability}Service` pattern (e.g., `ISessionService`, `IChatService`, `IVideoAnalysisService`).
- **Composition over Inheritance**: A class can implement multiple focused interfaces. Consumers should depend on the smallest interface they need.
- **Example**:
  ```typescript
  // ❌ BAD: God interface
  interface IDiagnosticService {
      processVideo(...): Promise<void>;
      handleChat(...): Promise<string>;
      processVoice(...): Promise<string>;
      getSession(...): Promise<Session>;
  }
  
  // ✅ GOOD: Focused interfaces
  interface IVideoAnalysisService { processVideo(...): Promise<void>; }
  interface IChatService { handleChat(...): Promise<string>; }
  interface IVoiceService { processVoice(...): Promise<string>; }
  interface ISessionService { getSession(...): Promise<Session>; }
  ```

## 4. Coding Standards

### Configuration & Constants
- **No Magic Strings/Numbers**: Do not hardcode configuration values (Models, API Keys, Timeouts, Feature Flags) in the codebase.
- **Source of Truth**: All config values must come from `src/infrastructure/config.ts` or `src/core/constants`.
- **Environment Variables**: Access environment variables ONLY through `config.ts`, never directly via `process.env` in business logic.

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

### Schema & Type Definitions (CRITICAL)
- **Single Source of Truth**: All Zod schemas and TypeScript types for domain entities MUST be defined in `src/core/types/models.ts`.
- **No Duplication**: Entity files in `src/core/entities/` should re-export from `models.ts`, NOT duplicate schemas.
- **Example**:
  ```typescript
  // ❌ BAD: Duplicated schema in entity file
  // src/core/entities/Vehicle.ts
  export const VehicleSchema = z.object({ ... }); // DUPLICATE!
  
  // ✅ GOOD: Re-export from canonical source
  // src/core/entities/Vehicle.ts
  export { VehicleSchema, type Vehicle } from '../types/models';
  ```
- **DTOs**: Request/Response DTOs go in `src/application/dtos/`. They may compose or extend core schemas but never redefine them.

### AI Persona & Safety Guidelines
- **Persona**: "Expert Senior Master Technician".
  - **Tone**: "Tech-to-Tech" (Collaborative, professional, concise). Treat the user like a capable apprentice.
  - **No Lectures**: Integrate safety checks naturally into the workflow (The "Quiet Professional").
- **Safety Interventions**:
  - **Hard Stops**: Only use all-caps/bold warnings for immediate life threats (e.g., fuel spray, high voltage).
  - **SafetyMonitor**: All chat/voice/video API routes MUST run the `SafetyMonitor.assess()` check on user input BEFORE generating an AI response.
  - If a hazard is detected, return a `X-Safety-Intervention` response immediately.
- **Modular Prompts**: Do NOT store all prompts in a single file.
  - Create a directory `src/core/prompts/`.
  - Separate prompts by domain (e.g., `voice.ts`, `video.ts`, `chat.ts`).
- **Never Override**: Do not weaken the safety prompts.

### API Routes
- **Secure**: All API routes must be protected by the Middleware (`src/middleware.ts`).
- **Thin Controllers**: API routes should extract params, call a Service, and return JSON. Business logic belongs in `src/application/services`.

### Firestore Pub/Sub & Real-Time Data (CRITICAL)
- **Single Source of Truth for State**: All data mutations flow through `ISessionRepository` (or domain-specific repositories).
- **No Direct Firestore Calls**: Never call `updateDoc()` or `setDoc()` directly in services or routes. Use repository methods.
- **Schema Consistency (HARD RULE)**:
  - Fields written by server MUST match fields read by client listeners
  - **Example of what NOT to do**: Server writes `aiAnalysis.safety_alert` but client reads `safety_stop`
  - Define all Firestore fields in Zod schema FIRST (in `src/core/types/models.ts`)
  - Implement repository methods that write to those exact fields
  - Client listeners expect the same field names—no translation layer needed
- **Real-Time Listeners**: Use `onSnapshot()` in React hooks with proper cleanup
  - Must be in `useEffect` (this is the ONE exception to the "no useEffect" rule—managing subscriptions is lifecycle management)
  - Always unsubscribe on unmount: `useEffect(() => { const unsub = onSnapshot(...); return () => unsub(); }, [id])`
  - No polling—true pub/sub only
- **Data Validation**: Before every Firestore write, validate with Zod schema
  - Use `DiagnosticSessionSchema.safeParse()` in repositories before update
  - Fail loudly with descriptive errors if validation fails
- **Timestamp Handling**: Convert Firestore Timestamps to JS Dates consistently
  - Create a shared utility in `src/infrastructure/firestore/timestamps.ts` to avoid duplication
  - Apply in all repository reads and listener callbacks

### File Structure & Clean Code
- **Single Responsibility**: Each file should do one thing well. If a file exceeds ~200 lines, YOU MUST NOT ADD TO IT. SPLIT IT.
- **No Bloat**: Avoid "God Components" or "God Services". Refactor mixed responsibilities into helper functions, hooks, or separate components.
- **Colocation**: Keep related styles, tests, and types close to the component if possible (or follow the FSD structure).

### Component Design
- **Reusability**: Components should be designed to be reused. Avoid hardcoding business logic inside UI components; pass data via props.
- **Composition**: Build complex UIs by composing smaller, atomic components.
- **Completeness**: Do NOT leave "TODO" comments for critical UI feedback (e.g., error notifications). Implement the necessary UI patterns (e.g., Toasts) immediately.
- **No Mocks**: Do not leave "mock" implementations or comments in production code. Implement the actual logic or a proper abstraction.

## 5. Firestore Pub/Sub Testing Checklist

Before committing any feature that modifies session state:

1. **Schema Definition**
   - [ ] Field defined in `src/core/types/models.ts` Zod schema
   - [ ] Field is NOT duplicated elsewhere

2. **Server Write Path**
   - [ ] Write happens ONLY through `ISessionRepository` method
   - [ ] Data validated with Zod before write
   - [ ] Field name matches schema exactly (no nested translations)

3. **Client Read Path**
   - [ ] Real-time listener expects exact field name from schema
   - [ ] Listener uses `onSnapshot()` in useEffect with cleanup
   - [ ] No polling or duplicate fetches

4. **Integration Test**
   - [ ] Server updates field
   - [ ] Client listener receives update within 100ms
   - [ ] UI reflects state change without manual refresh

**Example Checklist for Safety Alert Feature**:
- ✅ `safety_stop: z.boolean()` in `DiagnosticSessionSchema`
- ✅ `flagSafetyStop()` in repository writes to `safety_stop` field
- ✅ `useLiveSession()` reads `sessionData.safety_stop`
- ✅ Test: Fire safety alert → Client receives update → UI shows alert

## 6. Workflow for New Features
1.  **Define**: Create the Interface in `src/core/interfaces`.
2.  **Implement**: Create the Class in `src/infrastructure` or `src/application`.
3.  **Bind**: Add the Symbol to `types.ts` and bind it in `container.ts`.
4.  **Expose**: Create a Next.js API route if needed.
5.  **Consume**: Use SWR in the Frontend Component.
6.  **For State Changes**: Follow the Firestore Pub/Sub Testing Checklist above.

## 7. Environment
- **Local**: `.env.local` contains secrets.
- **Production**: Dockerized container (Cloud Run).
- **Config**: `next.config.ts` is set for `standalone` output.

---
## Build it like a Master Tech would: Precise, Clean, and Safe.

## 8. LiveKit Agents Best Practices
**Version v1.0+ Compliance Rules**

### Agent Architecture
*   **Deprecation Warning**: `MultimodalAgent` is **DEPRECATED** and removed in v1.0+. attempts to import it will fail.
*   **Unified Agent**: Use `voice.AgentSession` for ALL agent types (Voice, Video, Multimodal). It automatically adapts to the capabilities of the model provided.
*   **Model Access**: For Google Gemini Realtime, access the model via `google.beta.realtime.RealtimeModel` (plugin namespace subject to change).

### Critical Implementation Details
1.  **Worker Loop Protection**: When using `cli.runApp` in a file that might be imported by the worker path, **YOU MUST** guard the execution to prevent infinite recursion/timeouts.
    ```typescript
    // ✅ GOOD: Guarded Execution
    import { pathToFileURL } from 'url';
    
    if (import.meta.url === pathToFileURL(process.argv[1]).href) {
        cli.runApp(...)
    }
    ```
2.  **Session Start**: Do not look for `agent.start()`. The correct API is `agentSession.start(ctx.room)`.

### Example (Gemini Realtime)
```typescript
const model = new google.beta.realtime.RealtimeModel({ ... });
const session = new voice.AgentSession({ llm: model });
await session.start(ctx.room);
// ... existing code ...
await session.start(ctx.room);
```

## 9. Mobile Web Debugging Rules
Testing the mobile web app (`EXPO_PUBLIC_PLATFORM=web`) on a real device requires strict network configuration to avoid SSL and Mixed Content errors.

### Tunneling Strategy
1.  **Frontend**: MUST run with `npx expo start --web --tunnel`.
    *   This provides a public HTTPS URL (e.g., `https://xxxx.exp.direct`).
2.  **Backend**: MUST be tunneled via Ngrok (`npx ngrok http 3000`).
    *   This provides a public HTTPS URL (e.g., `https://xxxx.ngrok-free.app`).
    *   Update `mobile/.env` `EXPO_PUBLIC_API_URL` to this Ngrok URL.

### Bypass Security Warnings
Ngrok blocks programmatic API requests (like `fetch()`) with an HTML warning page.
*   **Fix**: All API Clients fetching from the Ngrok backend MUST include the header:
    ```javascript
    headers: { 'ngrok-skip-browser-warning': 'true' }
    ```
*   **Server Handling**: The Backend API (`src/app/api/...`) MUST explicitly allow this header in CORS:
    ```typescript
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, ngrok-skip-browser-warning'
    ```
    And MUST export an `OPTIONS` handler to satisfy preflight checks.