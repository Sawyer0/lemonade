# The Neurosymbolic Mechanic System

This document outlines the architecture of the **Neurosymbolic AI System** used in Lemonade to provide accurate, safe, and ground-truth verified mechanical diagnoses.

## The Core Philosophy: "System 1 vs. System 2"

Standard LLMs act like "System 1" (Fast, Intuitive, Prone to Hallucination). A mechanic needs "System 2" (Slow, Deliberate, grounded in Manuals and Laws).

We do not just "ask the AI". We run a **4-Node Verification Loop** before answering the user.

## The 4-Node Architecture

The `MechanicReasoningService` orchestrates these four specialized nodes:

### Node 1: Intuition (Perception)
* **Role**: The "Gut Check".
* **Input**: User Video/Audio + Query.
* **Mechanism**: Gemini Pro Vision analysis.
* **Output**: A hypothesis (e.g., "Sounds like a bad alternator bearing") with a raw confidence score.
* **Risk**: High. It might hallucinate (e.g., seeing rust where there is none).

### Node 2: Authority (The Law)
* **Role**: The "Compliance Officer".
* **Input**: Vehicle Year/Make/Model/VIN.
* **Mechanism**: `NHTSAService` checks for active Recalls and TSBs.
* **Authority**: **Absolute**. If a safety recall exists for the component in question, it OVERRIDES all other nodes.
* **Logic**: *If Recall Found -> FORCE STOP_DANGER.*

### Node 3: Consensus (Collective Memory)
* **Role**: The "Forum Wisdom".
* **Input**: Vector embeddings of the symptom.
* **Mechanism**: `VectorRepository` searches a database of verified fixes from other users/mechanics.
* **Output**: A "Consensus Fix" (e.g., "95% of F-150s with this noise needed a new water pump, not an alternator").
* **Logic**: Used to challenge Node 1. *If Intuition says A, but 90% of History says B, flag a "Community Consensus Alert".*

### Node 4: Reality Anchor (Visual Grounding)
* **Role**: The "Eyes".
* **Input**: High-Res Frames from the video.
* **Mechanism**: Specialized Vision confirmation task.
* **Output**: Physical state verification (e.g., "Is it stock?", "Is it Modified?", "is there visible damage?").
* **Purpose**: To prevent the AI from quoting a manual for a stock part when the user has a modified aftermarket turbo.

## The Synthesis Loop (The "Diagnose" Method)

The system aggregates these four inputs into a strictly typed `NeurosymbolicState`:

1.  **Parallel Execution**: Nodes 1, 2, and 3 run simultaneously.
2.  **Safety Override**: If Node 2 (NHTSA) flags danger, the process halts immediately with `decision: STOP_DANGER`.
3.  **Conflict Resolution**:
    *   *Intuition vs. Consensus*: Note the discrepancy.
    *   *Manual vs. Reality*: Reality wins.
4.  **Final Verdict**: A structured JSON output containing:
    *   `decision`: PROCEED | STOP_DANGER | REQUEST_INFO
    *   `reasoningTrace`: A step-by-step log of how the decision was made.
    *   `userOutput`: The final, safe response.

## Why This Replaces "Manual Uploads"

We no longer ask mechanics to upload 1000-page PDFs because:
1.  **It's Slow**: Reading 1000 pages takes time.
2.  **It's Outdated**: Manuals don't know about Recalls issued yesterday. Node 2 (NHTSA) does.
3.  **It's Incomplete**: Manuals don't know that "everyone on the forum knows this part fails". Node 3 (Consensus) does.


This system effectively "simulates" a Master Mechanic who knows the book, knows the laws, and knows what actually breaks in the real world.

## State Machine Architecture

While we do not use an explicit Finite State Machine (FSM) library like XState, the `MechanicReasoningService` implements a **Strictly Typed Accumulator State Machine**.

### The "NeurosymbolicState" Accumulator

The state is not a simple string enum; it is a rich object (`NeurosymbolicState`) that accumulates data as it passes through the pipeline. 

1.  **State 0: Void**
    *   Input: `ReasoningInput` (User Query, Video URL, VIN)
    *   State: Empty.

2.  **State 1: Perception (Parallel)**
    *   Transition: `Promise.all([Intuition, Authority, Consensus])`
    *   Action: Gather raw signals from AI, NHTSA, and Vector DB.
    *   State Mutation: `intuition`, `authorityData`, and `consensus` fields are populated.

3.  **State 2: The Safety Gate (Conditional Terminal)**
    *   Transition: `if (authorityData.hasRecall)`
    *   Action: Immediate override.
    *   Terminal State: `STOP_DANGER` verdict.

4.  **State 3: Synthesis (Reasoning)**
    *   Transition: Logic rules apply conflict resolution (e.g., "Reality trumps Manual").
    *   Action: Generate `reasoningTrace` and `userOutput`.
    *   State Mutation: `finalDiagnosis` field is populated.

5.  **State 4: Learning (Post-Terminal)**
    *   Transition: `if (confidence > threshold && !recall)`
    *   Action: Asynchronous write to Vector DB.
    *   State: Unchanged (Side Effect).

