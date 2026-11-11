/**
 * Live end-to-end test of the talker/reasoner split (LM-14). Skipped unless
 * RUN_LIVE_AGENT_TESTS=true and LIVEKIT_URL, LIVEKIT_API_KEY,
 * LIVEKIT_API_SECRET, GOOGLE_API_KEY and MAIN_APP_API_KEY are set, and the
 * Lemonade app (the job service) is reachable at JOBS_BASE_URL
 * (default http://localhost:3000). Run with the app already running:
 * `npm run dev`, then `npm --workspace agent run test:live`.
 *
 * It starts the agent worker, joins a fresh room as a test participant,
 * speaks a hard question (ABS light + spongy brakes), and asserts the
 * talker/reasoner contract end to end:
 *   1. the talker keeps talking — the agent speaks before the reasoner finishes;
 *   2. a diagnostic job is filed for the case and runs to a terminal status;
 *   3. after a forced participant reconnect mid-job (same room, same case),
 *      the finding itself is spoken — a distinctive word from the finding
 *      event shows up in the transcript after the reconnect.
 *
 * Scope: this test disconnects and rejoins only the test participant. The
 * agent worker, its Gemini session, and its SSE subscriptions never drop,
 * so resumeForCase + acked-seq replay after a real agent reconnect is NOT
 * exercised here — that path is covered by the ResultInjector unit tests
 * (resume skips acked seqs and replays unacked results). Restarting the
 * worker mid-job would need an explicit LiveKit agent dispatch into the
 * existing room, which this harness does not drive.
 *
 * The full reasoner pipeline (manual, recalls, similar cases, verification)
 * is slow: the job poll allows up to 4 minutes.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

const REQUIRED = [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'GOOGLE_API_KEY',
    'MAIN_APP_API_KEY',
] as const;
const JOBS_BASE_URL = (process.env.JOBS_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const enabled = process.env.RUN_LIVE_AGENT_TESTS === 'true' && REQUIRED.every((name) => process.env[name]);

const SAMPLE_RATE = 24_000; // Gemini TTS returns 24 kHz 16-bit mono PCM.
const FRAME_SAMPLES = SAMPLE_RATE / 100; // 10 ms frames
const QUESTION =
    'Hi, my ABS light is on and the brakes feel spongy. Is it safe to drive, and what should I check first?';
const JOB_POLL_TIMEOUT_MS = 240_000;
const FINDING_TIMEOUT_MS = 90_000;
const FIRST_SPEECH_TIMEOUT_MS = 45_000;

async function jobsServiceUp(): Promise<boolean> {
    try {
        const response = await fetch(`${JOBS_BASE_URL}/api/jobs?caseId=${randomUUID()}`, {
            headers: { 'x-api-key': process.env.MAIN_APP_API_KEY as string },
            signal: AbortSignal.timeout(5_000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

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

async function joinToken(room: string, identity: string, caseId: string): Promise<string> {
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity,
        metadata: JSON.stringify({
            userId: identity,
            caseId,
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

type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

async function listJobs(caseId: string): Promise<Array<{ id: string; status: JobStatus }>> {
    const response = await fetch(`${JOBS_BASE_URL}/api/jobs?caseId=${caseId}`, {
        headers: { 'x-api-key': process.env.MAIN_APP_API_KEY as string },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`jobs API returned ${response.status}`);
    return (await response.json()) as Array<{ id: string; status: JobStatus }>;
}

async function getJobEvents(jobId: string): Promise<Array<{ kind: string; text: string }>> {
    const response = await fetch(`${JOBS_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: { 'x-api-key': process.env.MAIN_APP_API_KEY as string },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`job API returned ${response.status}`);
    const body = (await response.json()) as { events: Array<{ kind: string; text: string }> };
    return body.events;
}

/**
 * Distinctive words from a finding's text. The agent paraphrases the
 * finding when it speaks it, so the assertion needs any one of several
 * content words, not the verbatim line.
 */
function findingKeywords(text: string): string[] {
    return [
        ...new Set(
            text
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter((word) => word.length >= 6),
        ),
    ].slice(0, 8);
}

const live = enabled && (await jobsServiceUp());
if (enabled && !live) {
    console.warn(
        `talkerReasoner live test skipped: job service not reachable at ${JOBS_BASE_URL} (is the app running?)`,
    );
}

describe.skipIf(!live)('live talker/reasoner split (LM-14)', () => {
    let worker: ChildProcess | undefined;
    const room = new Room();
    const roomName = `lemonade-lm14-${Date.now()}`;
    const caseId = randomUUID();
    const transcripts: string[] = [];

    beforeAll(async () => {
        const workerEntry = fileURLToPath(new URL('../../src/worker.ts', import.meta.url));
        worker = spawn('npx', ['tsx', workerEntry, 'dev'], {
            cwd: fileURLToPath(new URL('../..', import.meta.url)),
            env: { ...process.env },
            stdio: 'inherit',
        });
        await new Promise((resolve) => setTimeout(resolve, 8_000)); // let the worker register
        room.registerTextStreamHandler('lk.transcription', async (reader, participant) => {
            if (participant.identity !== 'e2e-driver') transcripts.push(await reader.readAll());
        });
        room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
            if (topic === LiveChannelTopic.AiResponse) transcripts.push(new TextDecoder().decode(payload));
        });
        await room.connect(process.env.LIVEKIT_URL!, await joinToken(roomName, 'e2e-driver', caseId), {
            autoSubscribe: true,
            dynacast: false,
        });
    }, 60_000);

    afterAll(async () => {
        await room.disconnect();
        worker?.kill('SIGTERM');
    });

    it(
        'keeps talking while the reasoner works, and speaks the finding after a participant reconnect',
        async () => {
            let heardAgent = false;
            let transcriptLengthAtReconnect = 0;
            const audioListener = async (track: RemoteTrack) => {
                if (track.kind !== TrackKind.KIND_AUDIO) return;
                for await (const frame of new AudioStream(track)) {
                    if (rms(frame) > 500) {
                        heardAgent = true;
                    }
                }
            };
            room.on(RoomEvent.TrackSubscribed, audioListener);

            const source = new AudioSource(SAMPLE_RATE, 1);
            const track = LocalAudioTrack.createAudioTrack('e2e-mic', source);
            const options = new TrackPublishOptions();
            options.source = TrackSource.SOURCE_MICROPHONE;
            await room.localParticipant!.publishTrack(track, options);

            await speak(source, await synthesizeQuestion());

            // 1. The talker answers before the reasoner finishes.
            await expect.poll(() => heardAgent, { timeout: FIRST_SPEECH_TIMEOUT_MS }).toBe(true);

            // 2. A job is filed for the case and runs to a terminal status.
            // Reconnect mid-job: the test participant leaves and rejoins
            // the same room with the same case. The agent worker itself
            // never restarts here (see the scope note at the top of file).
            let reconnected = false;
            const terminal = await expect
                .poll(
                    async () => {
                        const jobs = await listJobs(caseId);
                        const job = jobs[0];
                        if (job && (job.status === 'running' || job.status === 'pending') && !reconnected) {
                            reconnected = true;
                            await room.disconnect();
                            await room.connect(
                                process.env.LIVEKIT_URL!,
                                await joinToken(roomName, 'e2e-driver', caseId),
                                { autoSubscribe: true, dynacast: false },
                            );
                            transcriptLengthAtReconnect = transcripts.join(' ').length;
                        }
                        return job?.status;
                    },
                    { timeout: JOB_POLL_TIMEOUT_MS, interval: 5_000 },
                )
                .toMatch(/^(succeeded|failed)$/);
            expect(terminal).toBe('succeeded');

            // 3. The finding itself is spoken after the reconnect — not
            // just any speech: a distinctive word from the finding event
            // must show up in the transcript after the reconnect.
            const jobId = (await listJobs(caseId))[0]?.id;
            expect(jobId).toBeDefined();
            const finding = (await getJobEvents(jobId!)).find((event) => event.kind === 'finding');
            expect(finding).toBeDefined();
            const keywords = findingKeywords(finding!.text);
            expect(keywords.length).toBeGreaterThan(0);
            await expect
                .poll(
                    () => {
                        const spokenAfterReconnect = transcripts
                            .join(' ')
                            .slice(transcriptLengthAtReconnect)
                            .toLowerCase();
                        return keywords.some((word) => spokenAfterReconnect.includes(word));
                    },
                    { timeout: FINDING_TIMEOUT_MS },
                )
                .toBe(true);
        },
        JOB_POLL_TIMEOUT_MS + FINDING_TIMEOUT_MS + 60_000,
    );
});
