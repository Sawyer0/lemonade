# Lean Multimodal Architecture

This document details the architectural simplification enabled by the **Gemini 2.5 Flash** native multimodal model.

## 1. The Unified Multimodal Model

Previously (e.g., GPT-4 era), complex applications required multiple distinct models to handle different modalities:
*   **Audio Input**: Whisper (STT)
*   **Reasoning**: LLM
*   **Vision**: Specialized Vision Model
*   **Audio Output**: TTS

In the **Lemonade** architecture, **Gemini 2.5 Flash** handles all four tasks simultaneously within a single WebSocket connection.

## 2. Unified Text & Voice Context

The "Live" session supports fluid switching between voice and text without context switching. Both modalities travel through the same WebSocket pipe.

### Workflow
1.  **User Action**: User types a query (e.g., "What is the torque spec for this bolt?").
2.  **App Logic**: The client sends a JSON payload `{"text": "..."}` into the existing active WebSocket.
3.  **Context Integration**: The model receives the text while retaining access to:
    *   Video frames sent recently.
    *   Audio conversation history.
4.  **Response**: The model answers with full awareness of the visual and audio context.

**Example Scenario**:
*   *User (Typing)*: "Is this part broken?"
*   *System Response*: "Yes, I see the crack in the manifold in the video stream."

## 3. Architecture Consolidation

The technology stack utilizes a streamlined approach, removing the need for intermediary services.

### Core Stack (Retained)
*   **React Native App**: Handles UI and orchestration logic.
*   **WebSocket Client**: Manages the single persistent connection.
*   **Gemini 2.5 Flash**: The central "Brain" handling Audio, Video, and Text.

### Deprecated Components (The "Graveyard")
The following components are no longer required:
*   ~~**TFLite / NPU**~~: Removed. Gemini processes visual data on-demand server-side.
*   ~~**LiveKit Server**~~: Removed. Direct connection to Google.
*   ~~**Google STT API**~~: Removed. Gemini processes native audio input.
*   ~~**Google TTS API**~~: Removed. Gemini generates native audio output.
*   ~~**Separate Vision Model**~~: Removed. Merged into the multimodal Flash model.
