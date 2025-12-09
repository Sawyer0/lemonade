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

3.  **Hybrid Mobile Architecture**:
    *   **The "Native" Zone**: React Native (with LiveKit SDK).
        *   **Responsibility**: Camera stream, Microphone (VAD/Echo Cancellation), Call Controls.
        *   **Why**: Critical need for 60fps low-latency video and raw hardware access. **Never put the live call in a WebView.**
    *   **The "WebView" Zone**: Next.js (WebView).
        *   **Responsibility**: Complex Content like PDF Manuals, Wiring Diagrams, Chat History, Billing.
        *   **Why**: Rendering complex documents/HTML is trivial in Next.js but painful in Native.
    *   **The Bridge (Mode Switching UX)**:
        *   **Chat Mode (Default)**: Standard scrolling history with Inline Attachments (WebView).
        *   **Live Mode**: Full-screen Native Camera/Voice.
        *   **Interaction**: User toggles modes manually. If AI prompts content in Live Mode, show a **Non-blocking Notification** (Pill). Tapping it switches to Chat Mode.

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
- **AI**: Google Vertex AI (Gemini 2.5 Flash for Video/Chat, Gemini Pro for Reasoning)
- **Real-Time**: **LiveKit** (WebRTC for low-latency Video/Voice)
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
- **Example**:
  ```typescript
  // ❌ BAD: God interface
  interface IDiagnosticService {
      processVideo(...): Promise<void>;
      handleChat(...): Promise<string>;
  }
  
  // ✅ GOOD: Focused interfaces
  interface IVideoAnalysisService { processVideo(...): Promise<void>; }
  interface IChatService { handleChat(...): Promise<string>; }
  ```

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
  logger.info("Processing video", { sessionId: "123", duration: 45 });
  ```

### File Structure & Clean Code
- **Single Responsibility**: Each file should do one thing well. If a file exceeds ~200 lines, YOU MUST NOT ADD TO IT. SPLIT IT.
- **No Bloat**: Avoid "God Components" or "God Services". Refactor mixed responsibilities into helper functions, hooks, or separate components.
- **Colocation**: Keep related styles, tests, and types close to the component if possible.

### Data Fetching
- **Anti-Pattern**: Using `useEffect` to fetch data.
- **Standard**: Use **SWR** (`useSWR`) for all client-side data fetching.

### Schema & Type Definitions (CRITICAL)
- **Single Source of Truth**: All Zod schemas MUST be defined in `src/core/types/models.ts`.
- **No Duplication**: Entity files should re-export from `models.ts`.
- **DTOs**: Request/Response DTOs go in `src/application/dtos/`.

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

## 7. LiveKit Agents Best Practices (v1.0+)

### Agent Architecture
*   **Unified Agent**: Use `voice.AgentSession`. `MultimodalAgent` is **DEPRECATED**.
*   **Model Access**: Use `google.beta.realtime.RealtimeModel`.

### Critical Implementation Details
1.  **Worker Loop Protection**: Guard `cli.runApp`.
    ```typescript
    import { pathToFileURL } from 'url';
    if (import.meta.url === pathToFileURL(process.argv[1]).href) {
        cli.runApp(...)
    }
    ```
2.  **Session Start**: Use `agentSession.start(ctx.room)`.

## 8. Mobile Web Debugging Rules

### Tunneling Strategy
1.  **Frontend**: `npx expo start --web --tunnel` (HTTPS).
2.  **Backend**: `npx ngrok http 3000` (HTTPS).

### Bypass Security Warnings
*   **Fix**: Include header `{ 'ngrok-skip-browser-warning': 'true' }` in all fetches.
*   **Server Handling**: Allow this header in CORS configuration.
