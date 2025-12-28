# Lemonade Prod - AI Agent Development Guide

This document serves as the **Source of Truth** for any AI agent working on the Lemonade codebase. Follow these rules strictly to maintain architectural integrity and production readiness. This application is highly sophisticated and is not an MVP it is in Prod.

## 1. Core Principles (The "Golden Rules")

1.  **NEVER Make Assumptions (Ask First)**:
    *   If a requirement is ambiguous (e.g., "Is this a 1:1 call or a group call?"), **ASK**.
    *   Do not implement "placeholder" logic based on guesses (e.g., "Assuming 1:1 for MVP").
    *   It is better to pause and clarify than to write code that needs to be rewritten.

2.  **Architecture: Anemic Domain Model (AI-Native)**:
    *   **Data (DTOs/Entities)**: Pure JSON state. ZERO methods. Serializable by default. Defined in `src/core/types`.
    *   **Logic (Services)**: Stateless functions/classes. Accept Data as arguments. Return Data. Defined in `src/application/services`.
    *   **Why?**: This allows 1:1 mapping with AI Tools and direct injection into LLM Context Windows without overhead.
    *   **Rule**: Do not refactor into "Rich OOP" (Classes with methods). Keep Data and Logic strictly separated.

3.  **Hybrid Mobile Architecture & Zero Middleman**:
    *   **The "Native" Zone**: React Native (Direct Client-to-Google).
        *   **Mechanism**: **Google Gen AI Client SDK** or **Multimodal Live API (WebSocket)**. 
        *   **Responsibility**: Camera stream, Microphone (VAD), Call Controls.
        *   **Rule**: The Backend is strictly a **Token Vending Machine**. Do not proxy audio/video through the server.
    *   **The "WebView" Zone**: Next.js (WebView).
        *   **Responsibility**: Complex Content like PDF Manuals, Wiring Diagrams, Chat History, Billing.
        *   **Why**: Rendering complex documents/HTML is trivial in Next.js but painful in Native.

4.  **Production Quality > MVP Speed**:
    *   **No "MVP" Hacks**: Do not add comments like `// TODO: Fix for MVP` or `// Temporary`. Write the code correctly the first time.
    *   **DRY (Don't Repeat Yourself)**: Never re-implement core logic (e.g., Timestamp parsing, ID generation) inline. Use shared infrastructure.
    *   **Complete Implementations**: Handle all data types (e.g., Text, Image, Tool Calls) in UI components. Do not "simplify" just to get something on screen.

## 2. Technology Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS (Utility-first)
- **Database**: Firebase Firestore (NoSQL)
- **Auth**: Firebase Authentication (Google Provider)
- **Storage**: Google Cloud Storage (Direct Uploads via Signed URLs)
- **AI**: **Single Model Architecture** (`gemini-2.5-flash` for ALL operations).
- **Real-Time**: **Direct WebSocket** to Google Gemini Live API.
- **Mobile**: **React Native** (Expo) + **WebView** (Hybrid Architecture)
- **State/Fetching**: **SWR** (client-side), **Anemic Domain Model** (server-side)
- **Dependency Injection**: **InversifyJS**

## 3. Architecture & Code Structure

### Feature-Sliced Layers
1.  **Core (`src/core`)**: Pure domain logic. Interfaces, Types, Zod Schemas, Constants. *No external dependencies.*
2.  **Infrastructure (`src/infrastructure`)**: Implementations of Core interfaces. Database calls, AI adapters, 3rd party APIs.
3.  **Application (`src/application`)**: Business logic services. Orchestrates Infrastructure tools to solve domain problems.
4.  **Presentation (`src/presentation`)**: React components, Hooks, Context. *Only interacts with Application Services or Hooks.*

### Dependency Injection Rules
- **NEVER** instantiate services directly (e.g., `new VehicleService()`).
- **ALWAYS** use the DI Container (`src/infrastructure/di/container.ts`).
- **ALWAYS** define an Interface in `Core` before writing an Implementation in `Infrastructure`.

### Interface Segregation (CRITICAL)
- **No God Interfaces**: Interfaces must be small and focused.

## 4. Coding Standards

### Configuration & Constants
- **No Magic Strings**: Do not hardcode configuration values.
- **Source of Truth**: All config values must come from `src/infrastructure/config.ts`.
- **Environment Variables**: Access ONLY via `config.ts`, never directly via `process.env` in business logic.

### Error Handling & Logging
- **Standardization**: Always use the `AppError` class and `ErrorCode` enum from `src/core/errors`.
- **Structured Logging**: **NEVER** use `console.log`. Use the `ILogger` service.
  ```typescript
  // Must be structured JSON
  logger.info("Processing video", { sessionId: "123", duration: 45 }, traceId);
  ```

### File Structure & Clean Code
- **Single Responsibility**: Each file should do one thing well. If a file exceeds ~200 lines, YOU MUST NOT ADD TO IT. SPLIT IT.
- **No Bloat**: Avoid "God Components" or "God Services". Refactor mixed responsibilities into helper functions, hooks, or separate components.

### Data Fetching
- **Anti-Pattern**: Using `useEffect` to fetch data.
- **Standard**: Use **SWR** (`useSWR`) for all client-side data fetching.

### Schema & Type Definitions (CRITICAL)
- **Single Source of Truth**: All Zod schemas MUST be defined in `src/core/types/models.ts`.
- **No Duplication**: Entity files should re-export from `models.ts`.
- **Models vs DTOs**:
    - **Models (`src/core/types/models.ts`)**: Core Domain Entities. Represents internal state. "Anemic" (data only).
    - **DTOs (`src/application/dtos`)**: Data Transfer Objects. Defines API contracts (Input/Output). Can be subsets or composites of Models.
    - **Rule**: Use Models for internal logic/services. Use DTOs for external communication/validation.

### Code Hygiene & Discipline (STRICT)

1.  **NO Self-Talk Comments**:
    *   **Bad**: `// I think we should do this maybe?`, `// TODO: Fix this later`, `// Assuming this works`.
    *   **Good**: `// Retrying connection due to flaky network`, `// Required by API v2 spec`.
    *   **Rule**: Application code is not a diary. If you are unsure, **ASK**. If you leave a comment, it must be valuable for the *next* developer.

2.  **Ask, Don't Assume**:
    *   **Rule**: If a requirement is missing (e.g., "What happens if offline?"), stop and ask the user. Do not implement "best guess" logic.

3.  **`useEffect` Restrictions**:
    *   **Rule**: **NEVER** use `useEffect` for things that can be handled by Event Handlers (e.g., button clicks, form submissions).
    *   **Rule**: **NEVER** use `useEffect` to "watch" state for side effects if a direct function call can achieve it.
    *   **Exception**: Synchronization (e.g., subscriptions, raw DOM access) is allowed.

4.  **No Unimplemented Features**:
    *   **Rule**: Do not leave methods empty or with `console.log("Not implemented")`. If it's in the interface, implementation is mandatory. If it's not, add it.

5.  **Compilation Hygiene (CRITICAL)**:
    *   **Mistake**: Committing code with syntax errors (e.g., malformed JSX) or duplicate method definitions.
    *   **Rule**: **ALWAYS** verify that the file is syntactically correct before "finishing". Re-read the `view_file` output if unclear.
    *   **Rule**: Check for duplicate method signatures when refactoring classes.

6.  **Strict Logging & Tracing**:
    *   **Mistake**: Using `console.log` in production code or ignoring distributed tracing.
    *   **Rule**: Client-side code **MUST** use a structured logger implementation (e.g., `MobileLogger`) mirroring the server's `ILogger`.
    *   **Rule**: All log entries **MUST** include a `traceId` (e.g., `sessionId`) to allow full-stack correlation. `console.log` is forbidden.

### AI Persona & Safety Guidelines
- **Persona**: "Expert Senior Master Technician". Tone: "Tech-to-Tech" (Collaborative, professional).
- **SafetyMonitor**: All chat/voice/video API routes MUST run `SafetyMonitor.assess()` BEFORE generating an AI response.
- **Modular Prompts**: Store prompts in `src/core/prompts/`, separated by domain.

## 5. Firestore Pub/Sub & Real-Time Data

- **Single Source of Truth**: All mutations flow through `ISessionRepository`.
- **Schema Consistency**: Defined in `src/core/types/models.ts`. Server writes and Client reads MUST match exactly.
- **Real-Time Listeners**: Use `onSnapshot()` in `useEffect` with cleanup.
  ```typescript
  useEffect(() => { 
      const unsub = onSnapshot(...); 
      return () => unsub(); 
  }, [id]);
  ```
- **Validation**: Validate with `DiagnosticSessionSchema.safeParse()` before every write.

## 6. Workflow for New Features
1.  **Define**: Create the Interface in `src/core/interfaces`.
2.  **Implement**: Create the Class in `src/infrastructure` or `src/application`.
3.  **Bind**: Add the Symbol to `types.ts` and bind it in `container.ts`.
4.  **Expose**: Create a Next.js API route if needed.
5.  **Consume**: Use SWR in the Frontend Component.
6.  **State**: Follow the Firestore Pub/Sub Checklist.

## 7. Client-Side AI & WebSocket Rules

### Direct Connection
*   **Token Vending**: Clients MUST request an ephemeral token from `/api/session/token` before connecting to Gemini.
*   **No Server Proxy**: Audio/Video streams MUST go directly from Client to Google WebSocket.

### Security
*   **Ephemeral Tokens Only**: NEVER store hardcoded API keys in the client.
*   **Scopes**: Tokens should differ for Text vs Agent capabilities if possible.

## 8. Mobile Web Debugging Rules

### Tunneling Strategy
1.  **Frontend**: `npx expo start --web --tunnel` (HTTPS).
2.  **Backend**: `npx ngrok http 3000` (HTTPS).

### Bypass Security Warnings
*   **Fix**: Include header `{ 'ngrok-skip-browser-warning': 'true' }` in all fetches.
*   **Server Handling**: Allow this header in CORS configuration.
