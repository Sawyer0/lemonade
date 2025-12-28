# Server-Driven Gating

The "Solved Pattern" for this specific setup (Cloud-Native Intelligence + Low Cost) is called **"Server-Driven Gating."**

Instead of the client deciding when to stream video, Gemini decides when it needs visual input.

## The Strategy: "The Blind Assistant"

In this model, the default state is **Audio-Only**. The AI is effectively "blindfolded" until it determines that visual context is required to answer the user's question.

### 1. The Workflow

- **State**: App connects to WebSocket. Audio is ON. Video is OFF.
- **User**: "My car is making a weird noise."
- **Cost**: Cheap Audio tokens.
- **Gemini (Thinking)**: User mentioned noise. Video is not needed yet.
- **Gemini (Speaking)**: "Can you describe the noise? Is it a clicking or a grinding?"
- **User**: "It's clicking, and I don't know what this part is."
- **Gemini (Thinking)**: User asked "What is this?". Visual context is lacking. Visuals are needed.
- **Gemini (Action)**: Sends a Function Call / Tool Command to the client: `{"command": "START_VIDEO_STREAM"}`
- **App**: React Native client receives command -> Opens Camera stream.
- **Cost**: Expensive Video tokens start now.
- **Gemini**: Analyzes frames. "That is your starter motor."
- **Gemini (Action)**: Sends command: `{"command": "STOP_VIDEO_STREAM"}`
- **App**: Cuts the video feed.

### 2. Strategic Fit

1.  **No TFLite Needed**: The logic is not on the phone. The logic resides in the prompt instruction given to Gemini (*"You are a mechanic. Only ask for video when you cannot solve the problem with audio."*).
2.  **Cost Control**: Video costs are avoided while the user is just saying "Hello" or explaining the backstory. Costs are only incurred for the 10-20 seconds of actual inspection.
3.  **User Experience**: The interaction feels intelligent. The AI says, "I need to take a look at that, can you hold your phone up?" -> Camera turns on.

### 3. React Native Implementation Details

The implementation utilizes the WebSocket's bi-directional nature. Instead of purely sending data, the client listens for control signals.

**The "Protocol":**

A simple JSON contract is defined in the System Prompt.

**System Prompt:**
> "You are an AR repair assistant. You cannot see the user initially.
> If the user asks you to identify something, or if you need to see the car to diagnose a problem, output the JSON command: `{"tool": "START_VIDEO"}`.
> Once you have identified the part or issue, output: `{"tool": "STOP_VIDEO"}`."

**React Native (Pseudo-Code):**

```javascript
ws.onmessage = (event) => {
  const response = JSON.parse(event.data);

  // Check if Gemini is asking for vision
  if (response.tool === "START_VIDEO") {
    setVideoStreamActive(true); // Starts pushing frames to WS
  }

  if (response.tool === "STOP_VIDEO") {
    setVideoStreamActive(false); // Stops pushing frames
  }

  // Handle standard audio response...
  playAudio(response.audioContent);
};
```

### 4. Cost Projection (Server-Driven)

Using a hypothetical 10-minute repair session:

- **Audio (10 mins)**: Always connected.
    - Cost: ~$0.05
- **Video (The Change)**:
    - **Before (Always On)**: 10 mins x $0.40/min = **$4.00**
    - **Now (Server-Gated)**: The AI only needs to "see" for approx. 3 bursts of 15 seconds each (45 seconds total).
    - 45 seconds x 263 tokens/sec = 11,835 tokens.
    - Cost: ~$0.03
- **Total Cost**: $0.08 per session.
- **Compare to Always-On**: $4.05
- **Savings**: 98%

## Summary

This architecture provides the following benefits:

1.  Removes the need for TFLite.
2.  Keeps Live Audio always on (acting as a cheap control channel).
3.  Instructs Gemini to act as the "Director" of the stream.
4.  React Native simply obeys the ON/OFF commands from the cloud.

This is the ultimate optimization, leveraging the AI's intelligence to optimize operational costs.
