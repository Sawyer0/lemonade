# AI Tool Audit & Orchestration Report

## Overview
This document summarizes the audit of AI tools and their orchestration within the Lemonade platform.

## Identified Tools

| Tool Name | Source File | Status | Purpose |
| --- | --- | --- | --- |
| `display_content` | `packages/infrastructure/src/ai/tools/displayContent.ts` | **DEAD** | Display diagrams/manuals. Not handled by server or client. |
| `google_search` | `packages/infrastructure/src/ai/tools/googleSearch.ts` | **OK** | Server-side search. Functional. |
| `start_video_stream` | `packages/infrastructure/src/ai/tools/startVideoStream.ts` | **PARTIAL** | Request camera. Handled manually in Chat Adapter. |
| `verifySafeSupport` | `packages/infrastructure/src/ai/tools/verifySafeSupport.ts` | **BUGGY** | Verify jack stands. Returns dummy failure server-side. |
| `inspect_vehicle_component` | `agent/src/livekit-agent.ts` | **REDUNDANT** | Overlaps with `start_video_stream` but specific to LiveKit. |

## Critical Redundancies & Gaps

1. **Adapter Fragmentation:**
    - `GeminiFlashChatAndUploadsAdapter` uses `handleFunctionCalls` utility.
    - `GeminiFlashLiveStreamAdapter` does **NOT** use any function calling orchestration.
    - `LiveKit Agent` uses `@livekit/agents` tool definitions, bypassing shared infrastructure tools.

2. **Orchestration Mismatch:**
    - `src/app/api/chat/route.ts` uses Vercel AI SDK directly and is **not tool-aware**. It does not use the `ChatService` or the `ChatAI` adapter which contain the tool logic.
    - Result: Tools work in some internal services but **NOT in the main user chat**.

3. **Prompt Contradictions:**
    - `packages/core/src/prompts/chat.ts` explicitly tells the AI **NOT** to use `google_search`, despite it being a core grounded feature.

4. **Implementation Errors:**
    - `verifySafeSupport` is handled server-side in `FunctionCallHandler` but it has no way to actually "see" the frame there (it's a text-based loop). This should be a client-side tool or coordinated with the Vision layer.
    - `display_content` is registered with the model but the response is never passed to the client.

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
