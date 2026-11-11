/**
 * Live end-to-end test of the Master Tech voice agent. Skipped unless
 * RUN_LIVE_AGENT_TESTS=true and LIVEKIT_URL, LIVEKIT_API_KEY,
 * LIVEKIT_API_SECRET and GOOGLE_API_KEY are set (run: npm --workspace agent run test:live).
 *
 * It starts the agent worker, joins a fresh room as a test participant,
 * speaks a question (synthesised with Gemini TTS), and asserts the agent
 * answers with audio and a text transcript.
 *
 * One live smoke test per provider, on demand: run the same test with
 * VOICE_PROVIDER=grok (plus XAI_API_KEY) or VOICE_PROVIDER=cascade (plus
 * DEEPGRAM_API_KEY and CARTESIA_API_KEY) in the environment. The worker
 * inherits process.env, so the provider switches with no other change.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { AccessToken } from 'livekit-server-sdk';
import {
    AudioFrame,
    AudioSource,
    AudioStream,
    LocalAudioTrack,
    Room,
    RoomEvent,
    TrackKind,
    TrackPublishOptions,
    TrackSource,
    type RemoteTrack,
} from '@livekit/rtc-node';
import { GEMINI_TTS_MODEL, LiveChannelTopic } from '@lemonade/core';

const REQUIRED = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'GOOGLE_API_KEY'] as const;
const enabled = process.env.RUN_LIVE_AGENT_TESTS === 'true' && REQUIRED.every((name) => process.env[name]);

const SAMPLE_RATE = 24_000; // Gemini TTS returns 24 kHz 16-bit mono PCM.
const FRAME_SAMPLES = SAMPLE_RATE / 100; // 10 ms frames
const QUESTION = 'Hi, my brakes squeal every time I stop. What should I check first?';
const REPLY_TIMEOUT_MS = 60_000;

async function synthesizeQuestion(): Promise<Int16Array> {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
        model: GEMINI_TTS_MODEL,
        contents: [{ parts: [{ text: QUESTION }] }],
        config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
    });
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error('Gemini TTS returned no audio');
    const bytes = Buffer.from(data, 'base64');
    return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

async function joinToken(room: string, identity: string): Promise<string> {
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        metadata: JSON.stringify({
            userId: identity,
            vehicleContext: JSON.stringify({ year: 2017, make: 'Toyota', model: 'Camry' }),
        }),
    });
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    return token.toJwt();
}

/** Streams PCM into the room in real time, then a second of silence so the agent's VAD ends the turn. */
async function speak(source: AudioSource, pcm: Int16Array): Promise<void> {
    const padded = new Int16Array(pcm.length + SAMPLE_RATE);
    padded.set(pcm);
    for (let offset = 0; offset + FRAME_SAMPLES <= padded.length; offset += FRAME_SAMPLES) {
        const chunk = padded.slice(offset, offset + FRAME_SAMPLES);
        await source.captureFrame(new AudioFrame(chunk, SAMPLE_RATE, 1, FRAME_SAMPLES));
    }
}

function rms(frame: AudioFrame): number {
    let sum = 0;
    for (const sample of frame.data) sum += sample * sample;
    return Math.sqrt(sum / frame.data.length);
}

describe.skipIf(!enabled)('live voice agent (LiveKit + Gemini Live)', () => {
    let worker: ChildProcess | undefined;
    const room = new Room();
    const roomName = `lemonade-e2e-${Date.now()}`;

    beforeAll(async () => {
        const workerEntry = fileURLToPath(new URL('../../src/worker.ts', import.meta.url));
        worker = spawn('npx', ['tsx', workerEntry, 'dev'], {
            cwd: fileURLToPath(new URL('../..', import.meta.url)),
            env: { ...process.env },
            stdio: 'inherit',
        });
        await new Promise((resolve) => setTimeout(resolve, 8_000)); // let the worker register
        await room.connect(process.env.LIVEKIT_URL!, await joinToken(roomName, 'e2e-driver'), {
            autoSubscribe: true,
            dynacast: false,
        });
    }, 60_000);

    afterAll(async () => {
        await room.disconnect();
        worker?.kill('SIGTERM');
    });

    it(
        'answers a spoken question with speech and a transcript',
        async () => {
            const transcripts: string[] = [];
            room.registerTextStreamHandler('lk.transcription', async (reader, participant) => {
                if (participant.identity !== 'e2e-driver') transcripts.push(await reader.readAll());
            });
            room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
                if (topic === LiveChannelTopic.AiResponse) transcripts.push(new TextDecoder().decode(payload));
            });

            const agentSpoke = new Promise<void>((resolve) => {
                room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack) => {
                    if (track.kind !== TrackKind.KIND_AUDIO) return;
                    for await (const frame of new AudioStream(track)) {
                        if (rms(frame) > 500) return resolve();
                    }
                });
            });

            const source = new AudioSource(SAMPLE_RATE, 1);
            const track = LocalAudioTrack.createAudioTrack('e2e-mic', source);
            const options = new TrackPublishOptions();
            options.source = TrackSource.SOURCE_MICROPHONE;
            await room.localParticipant!.publishTrack(track, options);

            await speak(source, await synthesizeQuestion());

            await Promise.race([
                agentSpoke,
                new Promise((_, reject) => setTimeout(() => reject(new Error('agent never spoke')), REPLY_TIMEOUT_MS)),
            ]);
            await expect.poll(() => transcripts.join(' ').trim().length, { timeout: 30_000 }).toBeGreaterThan(0);
        },
        REPLY_TIMEOUT_MS + 60_000,
    );
});
