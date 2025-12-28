LiveKit docs › Building voice agents › Agent sessions

---

# Agent session

> How to use AgentSession to orchestrate your voice AI app.

## Overview

The `AgentSession` is the main orchestrator for your voice AI app. The session is responsible for collecting user input, managing the voice pipeline, invoking the LLM, sending the output back to the user, and emits events for observability and control.

Each session requires at least one `Agent` to orchestrate. The agent is responsible for defining the core AI logic - instructions, tools, etc - of your app. The framework supports the design of custom [workflows](https://docs.livekit.io/agents/build/workflows.md) to orchestrate handoff and delegation between multiple agents.

The following example shows how to begin a simple single-agent session:

**Python**:

```python
from livekit.agents import AgentSession, Agent, inference
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from livekit.agents.voice import room_io

session = AgentSession(
    stt="assemblyai/universal-streaming:en",
    llm="openai/gpt-4.1-mini",
    tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    vad=silero.VAD.load(),
    turn_detection=MultilingualModel(),
)

await session.start(
    room=ctx.room,
    agent=Agent(instructions="You are a helpful voice AI assistant."),
    room_options=room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    ),
)

```

---

**Node.js**:

```ts
import { voice, inference } from '@livekit/agents';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';

const vad = await silero.VAD.load();

const session = new voice.AgentSession({
  vad,
  stt: "assemblyai/universal-streaming:en",
  llm: "openai/gpt-4.1-mini",
  tts: "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
  turnDetection: new livekit.turnDetector.MultilingualModel(),
});

await session.start({
  room: ctx.room,
  agent: new voice.Agent({
    instructions: "You are a helpful voice AI assistant.",
  }),
  inputOptions: {
    noiseCancellation: BackgroundVoiceCancellation(),
  },
});

```

## Lifecycle

An `AgentSession` progresses through several distinct phases during its operation:

- **Initializing**: The session is setting up. During initialization, no audio or video processing occurs yet. Agent state is set to `initializing`.
- **Starting**: The session is started using the `start()` method. It sets up I/O connections, initializes agent activity tracking, and begins forwarding audio and video frames. In this phase, the agent is transitioned into the `listening` state.
- **Running**: The session is actively processing user input and generating agent responses. During this phase, your agent controls the session and can transfer control to other agents. In this phase, the agent transitions between `listening`, `thinking`, and `speaking` states.
- **Closing**: When a session is closed, the cleanup process includes gracefully draining pending speech (if requested), waiting for any queued operations to complete, committing any remaining user transcripts, and closing all I/O connections. The session emits a `close` event and resets internal state.

The following diagram shows the lifecycle of an `AgentSession` using agent states:

```mermaid
stateDiagram-v2
initializing --> listening : session started
listening --> thinking : user input received
thinking --> speaking : response generated
speaking --> listening : response complete
speaking --> listening : interrupted
listening --> initializing : session shutdown requested and states resetnote right of initializing
Session setup in progress
(no media I/O yet)
end notenote right of speaking
Agent outputs synthesized
audio response
end note
```

You can monitor agent state changes via the [`agent_state_changed` event](https://docs.livekit.io/agents/build/events.md#agent_state_changed).

## Events

`AgentSession` emits events throughout its lifecycle to provide visibility into the conversation flow. For more information, select the event name to see the properties and example code.

| **Event** | **Description** |
| [`agent_state_changed`](https://docs.livekit.io/agents/build/events.md#agent_state_changed) | Emitted when the agent's state changes (for example, from `listening` to `thinking` or `speaking`). |
| [`user_state_changed`](https://docs.livekit.io/agents/build/events.md#user_state_changed) | Emitted when the user's state changes (for example, from `listening` to `speaking`). |
| [`user_input_transcribed`](https://docs.livekit.io/agents/build/events.md#user_input_transcribed) | Emitted when user speech is transcribed to text. |
| [`conversation_item_added`](https://docs.livekit.io/agents/build/events.md#conversation_item_added) | Emitted when a message is added to the conversation history. |
| [`close`](https://docs.livekit.io/agents/build/events.md#close) | Emitted when the session closes, either gracefully or due to an error. |

## Session options

The `AgentSession` constructor accepts numerous options to configure behavior. The following sections describe the available options grouped by category.

### AI models

Configure the default speech and language models for your agent session. You can override these models for specific agents or tasks. To learn more about models, see the [models](https://docs.livekit.io/agents/models.md) topic.

### Turn detection & interruptions

Turn detection and interruptions are critical for managing conversation flow. The session provides several options to configure this behavior. For more information, see [Session configuration](https://docs.livekit.io/agents/build/turns.md#session-configuration).

### Tools and capabilities

Extend agent capabilities with [tools](https://docs.livekit.io/agents/build/tools.md):

- `tools`: List of `FunctionTool` or `RawFunctionTool` objects shared by all agents in the session.
- `mcp_servers`: List of MCP (Model Context Protocol) servers providing external tools.
- `max_tool_steps`: Maximum consecutive tool calls per LLM turn. Default: `3`.
- `ivr_detection`: Whether to detect if the agent is interacting with an Interactive Voice Response (IVR) system. Default: `False`. To learn more, see [DTMF](https://docs.livekit.io/sip/dtmf.md).

### User interaction

Configure user state and timing:

- `user_away_timeout`: Time in seconds of silence before setting user state to `away`. Set to `None` to turn off. Default: `15.0` seconds.
- `min_consecutive_speech_delay`: Minimum delay in seconds between consecutive agent utterances. Default: `0.0` seconds.

### Text processing

Control how [text](https://docs.livekit.io/agents/build/text.md) is processed:

- `tts_text_transforms`: Transforms to apply to TTS input text. Built-in transforms include `"filter_markdown"` and `"filter_emoji"`. Set to `None` to turn off. When not given, all filters are applied by default.
- `use_tts_aligned_transcript`: Whether to use TTS-aligned transcript as input for the transcription node. Only applies if the TTS supports aligned transcripts. Default: turned off.

### Performance optimization

Optimize response latency:

[`preemptive_generation`](https://docs.livekit.io/agents/build/audio.md#preemptive-generation): Whether to speculatively begin LLM and TTS requests before an end-of-turn is detected. When `True`, the agent sends inference calls as soon as a user transcript is received. This can reduce response latency but can incur extra compute costs if the user interrupts. Default: `False`.

### Video sampling

Control video frame processing:

`video_sampler`: Custom video sampler function or `None`. When not given, uses `VoiceActivityVideoSampler` which captures at ~1 fps while speaking and ~0.3 fps when silent. To learn more, see [Video](https://docs.livekit.io/agents/build/vision.md).

### Other options

`userdata`: Arbitrary per-session user data accessible via `session.userdata`. To learn more, see [Passing state](https://docs.livekit.io/agents/build/agents-handoffs.md#passing-state).

## rtc_session options

The following optional parameters are available when you define your entrypoint function using the `rtc_session` decorator:

- `agent_name`: Name of agent for agent disaptch. If this is set, the agent must be explicitly dispatched to a room. To learn more, see [Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch.md).
- `type`: Agent server type determines when a new instance of the agent is created: for each room or for each publisher in a room. To learn more, see [Agent server type](https://docs.livekit.io/agents/server/options.md#servertype).
- `on_session_end`: Callback function to be called when the session ends. To learn more, see [Session reports](https://docs.livekit.io/agents/observability/data.md#session-reports).
- `on_request`: Callback function to be called when a new request is received. To learn more see [Request handler](https://docs.livekit.io/agents/server/options.md#request-handler).

## RoomIO

Communication between agent and user participants happens using media streams, also known as tracks. For voice AI apps, this is primarily audio, but can include vision. By default, track management is handled by `RoomIO`, a utility class that serves as a bridge between the agent session and the LiveKit room. When an AgentSession is initiated, it automatically creates a `RoomIO` object that enables all room participants to subscribe to available audio tracks.

When starting an `AgentSession`, you can configure how the session interacts with the LiveKit room by passing `room_options` to the `start()` method. These options control media track management, participant linking, and I/O behavior.

### Room options

Configure how the agent interacts with room participants using `RoomOptions`. The following sections describe available options for input and output configuration.

#### Text input options

Use the `text_input` option to configure text input from participants.

- **`text_input`** _(TextInputOptions | bool)_ - Default: `True`: Configure options for text input. If `True`, text input is enabled. Use `TextInputOptions` to configure additional options.

##### `TextInputOptions` parameters

`text_input_cb`: Callback function to handle text input from participants. Default behavior interrupts the agent and generates a reply. To learn more, see [Custom handling](https://docs.livekit.io/agents/build/text.md#custom-handling) of text input.

#### Audio input options

- **`audio_input`** _(AudioInputOptions | bool)_ - Default: `True`: Configure audio input options. If `True`, audio input is enabled. Use `AudioInputOptions` to configure additional options.

##### `AudioInputOptions` parameters

- `sample_rate`: Audio sample rate in Hz. Default: 24000.
- `num_channels`: Number of audio channels. Default: 1.
- `frame_size_ms`: Frame size in milliseconds for audio input. Default: 50.
- `noise_cancellation`: [Noise cancellation](https://docs.livekit.io/home/cloud/noise-cancellation.md) options to apply to incoming audio. Can be a `NoiseCancellationOptions` instance or a selector function. Default: None.
- `pre_connect_audio`: Whether pre-connect audio is enabled. Default: True.
- `pre_connect_audio_timeout`: Time in seconds before pre-connect audio is ignored if not received. Default: 3.0.

#### Video input options

- **`video_input`** _(VideoInputOptions | bool)_ - Default: `False`: Video input options. If `True`, video input is enabled.

#### Audio output options

- **`audio_output`** _(AudioOutputOptions | bool)_ - Default: `True`: Audio output options. If `True`, audio output is enabled. Use `AudioOutputOptions` to configure additional options.

##### `AudioOutputOptions` parameters

- `sample_rate`: Audio sample rate in Hz. Default: 24000.
- `num_channels`: Number of audio channels. Default: 1.
- `track_publish_options`: Track publish options (`rct.TrackPublishOptions`)for the audio track (source, encryption, etc.). By default, sets the `source` to `TrackSource.SOURCE_MICROPHONE`.
- `track_name`: The name of the audio track to publish. Default: "roomio_audio".

#### Text output options

- **`text_output`** _(TextOutputOptions | bool)_ - Default: `True`: Configure transcription output options. If `True`, text output is enabled. Use `TextOutputOptions` to configure additional options.

##### `TextOutputOptions` parameters

- `sync_transcription`: Whether to synchronize transcription with audio output. When `True`, transcription is emitted in sync with the audio. When `False`, transcription is emitted as quickly as available.
- `transcription_speed_factor`: Speed factor for transcription synchronization (only effective if `sync_transcription` is `True`). Default: `1.0`.

#### Participant management

- `participant_kinds`: List of [participant types](https://docs.livekit.io/home/get-started/api-primitives.md#types-of-participants) accepted for auto subscription. By default, accepts `SIP` and `STANDARD` participants.
- `participant_identity`: The participant identity to link to. By default, links to the first participant. You can override this in the `RoomIO` constructor or by using `RoomIO.set_participant()`.

### Example usage

**Python**:

```python
from livekit.agents import voice
from livekit.agents.voice import room_io
from livekit.plugins import noise_cancellation


room_options=room_io.RoomOptions(
    video_input=True,
    audio_input=room_io.AudioInputOptions(
        noise_cancellation=noise_cancellation.BVC(),
    ),
    text_output=room_io.TextOutputOptions(
        sync_transcription=False,
    ),
    participant_identity="user_123",
)

await session.start(
    agent=my_agent,
    room=room,
    room_options=room_options,
)

```

---

**Node.js**:

In the Node.js Agents framework, room configuration uses separate `inputOptions` and `outputOptions` parameters instead of a unified `RoomOptions` object. For the complete interface definitions and default values, refer to the [RoomIO source code](https://github.com/livekit/agents-js/blob/main/agents/src/voice/room_io/room_io.ts).

When calling `session.start()`, pass `inputOptions` and `outputOptions` as separate parameters:

```typescript
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';

// ... session and agentsetup

await session.start({
  room: ctx.room,
  agent: myAgent,
  inputOptions: {
    textEnabled: true,
    audioEnabled: true,
    videoEnabled: true,
    noiseCancellation: BackgroundVoiceCancellation(),
    participantIdentity: "user_123",
  },
  outputOptions: {
    syncTranscription: false,
  },
});

```

To learn more about publishing audio and video, see the following topics:

- **[Agent speech and audio](https://docs.livekit.io/agents/build/audio.md)**: Add speech, audio, and background audio to your agent.

- **[Vision](https://docs.livekit.io/agents/build/vision.md)**: Give your agent the ability to see images and live video.

- **[Text and transcription](https://docs.livekit.io/agents/build/text.md)**: Send and receive text messages and transcription to and from your agent.

- **[Realtime media](https://docs.livekit.io/home/client/tracks.md)**: Tracks are a core LiveKit concept. Learn more about publishing and subscribing to media.

- **[Camera and microphone](https://docs.livekit.io/home/client/tracks/publish.md)**: Use the LiveKit SDKs to publish audio and video tracks from your user's device.

### Custom RoomIO

For greater control over media sharing in a room,  you can create a custom `RoomIO` object. For example, you might want to manually control which input and output devices are used, or to control which participants an agent listens to or responds to.

To replace the default one created in `AgentSession`, create a `RoomIO` object in your entrypoint function and pass it an instance of the `AgentSession` in the constructor. For examples, see the following in the repository:

- **[Toggling audio](https://github.com/livekit/agents/blob/main/examples/voice_agents/push_to_talk.py)**: Create a push-to-talk interface to toggle audio input and output.

- **[Toggling input and output](https://github.com/livekit/agents/blob/main/examples/voice_agents/toggle_io.py)**: Toggle both audio and text input and output.

---

This document was rendered at 2025-12-16T08:39:56.072Z.
For the latest version of this document, see [https://docs.livekit.io/agents/build/sessions.md](https://docs.livekit.io/agents/build/sessions.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).