# AI Tool Audit & Orchestration Report

## Overview
This document summarizes the audit of AI tools and their orchestration within the Lemonade platform.

## Identified Tools

| Tool Name | Source File | Status | Purpose |
| --- | --- | --- | --- |
| `display_content` | `packages/infrastructure/src/ai/tools/displayContent.ts` | **OK (client)** | Display diagrams/manuals. Client-side: the mobile app opens the URL in a modal (`mobile/hooks/useToolHandler.ts`, `mobile/hooks/useHybridBridge.ts`). The server loop returns the call to the client untouched. |
| `google_search` | `packages/infrastructure/src/ai/tools/googleSearch.ts` | **OK** | Server-side search. Functional. |
| `start_video_stream` | `packages/infrastructure/src/ai/tools/startVideoStream.ts` | **OK (client)** | Request camera. Handled by the mobile app (`mobile/hooks/useToolHandler.ts`). |
| `verify_safe_support` | `packages/infrastructure/src/ai/tools/verifySafeSupport.ts` | **OK (client)** | Verify jack stands. Client-side since LM-16: the mobile app opens the camera for it. The server used to intercept it with a canned failure; that branch is deleted and the registry marks it client-side. |
| `save_to_memory` | — (schema in `packages/core/src/types/tools.ts`) | **OK** | Server-side save to vehicle memory. Functional. |
| `inspect_vehicle_component` | `agent/src/livekit-agent.ts` | **REMOVED** | No longer exists anywhere in the repo; the LiveKit agent no longer declares it. Nothing to delete. |

One typed, namespaced tool registry (`packages/core/src/tools/`, LM-16) is
the single source of truth for these tools' names, sides and argument
schemas. Chat tools are registered under `chat.*` with their legacy flat
model-facing name kept as `modelName`; the reasoner's tools live under
`diag.*`. `FunctionCallHandler` reads the server/client split from the
registry instead of a hardcoded list.

## Critical Redundancies & Gaps

1. **Adapter Fragmentation:**
    - `GeminiFlashChatAndUploadsAdapter` uses `handleFunctionCalls` utility.
    - `GeminiFlashLiveStreamAdapter` does **NOT** use any function calling orchestration.
    - `LiveKit Agent` uses `@livekit/agents` tool definitions, bypassing shared infrastructure tools.

2. **Orchestration Mismatch:**
    - `src/app/api/chat/route.ts` uses Vercel AI SDK directly and is **not tool-aware**. It does not use the `ChatService` or the `ChatAI` adapter which contain the tool logic.
    - Result: Tools work in some internal services but **NOT in the main user chat**.

3. **Prompt Contradictions:**
    - ~~`packages/core/src/prompts/chat.ts` explicitly tells the AI **NOT** to use `google_search`, despite it being a core grounded feature.~~ Stale: `packages/core/src/prompts/ChatPrompts.ts` now lists `google_search` as a tool to use.

4. **Implementation Errors:**
    - ~~`verifySafeSupport` is handled server-side in `FunctionCallHandler` but it has no way to actually "see" the frame there (it's a text-based loop). This should be a client-side tool or coordinated with the Vision layer.~~ Fixed in LM-16: the server-side branch is deleted and the registry marks it client-side; the mobile app opens the camera for it.
    - ~~`display_content` is registered with the model but the response is never passed to the client.~~ Stale: the mobile app handles it (`mobile/hooks/useToolHandler.ts`) and the server loop returns the call to the client untouched.

## Refactor Status (Phase 2 & 3 Complete)

1. **Standardized Tool Handlers:**
    - `FunctionCallHandler` now handles `server-side` tools and correctly stops the loop for `client-side` tools, returning the response to the caller.
    - `GeminiFlashLiveStreamAdapter` now supports the same tool-calling orchestration as the Chat adapter.

2. **Unified Tooling:**
    - Standardized on snake_case for all tool names (e.g., `verify_safe_support`).
    - Tool interfaces and Zod schemas consolidated in `packages/core/src/types/tools.ts`.

3. **Validation & Quality:**
    - All tools in `FunctionCallHandler` now have Zod validation for arguments.
    - Added unit and integration tests for all adapters and the orchestration loop.

4. **Orchestration Unification:**
    - Gemini adapters now generically pass all unhandled tool calls back to the client.
    - Tracing (LangSmith) is integrated throughout the tool execution loop.
