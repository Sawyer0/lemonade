/**
 * LM-40 noisy-shop voice bake-off runner. On-demand live suite, NOT part of
 * CI: it speaks the 30 scripted turns to a real Master Tech worker over a
 * LiveKit room, one provider at a time, and writes one results table per run.
 *
 * Run it with one command (from the repo root), after building the
 * workspace packages once (npm --workspace @lemonade/core run build &&
 * npm --workspace @lemonade/infrastructure run build — the runner fails
 * fast naming the missing dist otherwise):
 *   npm --workspace agent run bakeoff -- --provider gemini
 *   npm --workspace agent run bakeoff -- --provider grok --turns T01,T09,T15
 *   npm --workspace agent run bakeoff -- --provider cascade --dry-run
 *
 * Needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GOOGLE_API_KEY
 * (to synthesise the prompts), and the selected provider's keys. Recorded
 * noise beds go in agent/test/bakeoff/noise/<id>.wav and clip stills in
 * agent/test/bakeoff/clips/<still>; a turn whose asset is missing is skipped
 * with status missing-asset, never scored on silence. Results land in
 * agent/test/bakeoff/results/<provider>-<timestamp>.{json,md}.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
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
import { GEMINI_TTS_MODEL, LiveChannelTopic, encodeLiveMessage } from '@lemonade/core';
import { loadCostRates, loadNoiseBeds, loadTurns, type BakeoffTurn, type NoiseBed } from './fixtures';
import { parseVoiceProviderId, VOICE_PROVIDER_KEYS, type VoiceProviderId } from '../../src/voice/provider';
import { renderResultsTable, scoreRun, type BakeoffTurnObservation, type ObservedToolCall } from './scorer';
import { AudioQualityTracker, mixNoise, readWavPcm, resampleLinear, type WavPcm } from './audioMix';

const BAKEOFF_DIR = fileURLToPath(new URL('.', import.meta.url));
const AGENT_DIR = fileURLToPath(new URL('../..', import.meta.url));
/**
 * tsx runs with this config, not agent/tsconfig.json: the agent paths map
 * @lemonade/core and @lemonade/infrastructure at their TypeScript sources,
 * and both packages compile to CommonJS, so a tsx file run cannot see their
 * named exports (Node's CJS lexer cannot read esbuild's star re-exports).
 * This config maps infrastructure at its built dist and leaves core to
 * resolve to its built dist through node_modules. Both dists must be built
 * first (see docs/voice-bakeoff.md); CI's agent typecheck still uses the
 * source paths in agent/tsconfig.json and is unaffected.
 */
const BAKEOFF_TSCONFIG = join(BAKEOFF_DIR, 'tsconfig.json');
const SAMPLE_RATE = 24_000;
const FRAME_SAMPLES = SAMPLE_RATE / 100;
const REPLY_TIMEOUT_MS = 60_000;
const SILENCE_END_MS = 2_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function argValue(argv: string[], name: string): string | undefined {
    const at = argv.indexOf(name);
    return at === -1 ? undefined : argv[at + 1];
}

/** What the room listeners record for the turn currently playing. */
interface TurnAudioState {
    transcriptParts: string[];
    aiResponseParts: string[];
    toolCalls: ObservedToolCall[];
    toolCallAtMs: number[];
    firstAudibleAtMs: number | null;
    lastAudibleAtMs: number | null;
    quality: AudioQualityTracker;
    promptEndedAt: number;
}

function rms(frame: AudioFrame): number {
    let sum = 0;
    for (const sample of frame.data) sum += sample * sample;
    return Math.sqrt(sum / frame.data.length);
}

function clippedFraction(frame: AudioFrame): number {
    let clipped = 0;
    for (const sample of frame.data) {
        if (sample >= 32767 || sample <= -32768) clipped += 1;
    }
    return clipped / frame.data.length;
}

async function synthesizeSpeech(text: string): Promise<Int16Array> {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
        model: GEMINI_TTS_MODEL,
        contents: [{ parts: [{ text }] }],
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

/** Streams PCM into the room in real time, then a second of silence so the agent's VAD ends the turn. */
async function speak(source: AudioSource, pcm: Int16Array): Promise<void> {
    const padded = new Int16Array(pcm.length + SAMPLE_RATE);
    padded.set(pcm);
    for (let offset = 0; offset + FRAME_SAMPLES <= padded.length; offset += FRAME_SAMPLES) {
        const chunk = padded.slice(offset, offset + FRAME_SAMPLES);
        await source.captureFrame(new AudioFrame(chunk, SAMPLE_RATE, 1, FRAME_SAMPLES));
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const provider: VoiceProviderId = parseVoiceProviderId(argValue(argv, '--provider'));
    const onlyTurns = argValue(argv, '--turns')
        ?.split(',')
        .map((id) => id.trim());
    const outDir = argValue(argv, '--out') ?? join(BAKEOFF_DIR, 'results');
    const dryRun = argv.includes('--dry-run');

    const turns = loadTurns(join(BAKEOFF_DIR, 'turns.json'));
    const beds = new Map(loadNoiseBeds(join(BAKEOFF_DIR, 'noise-beds.json')).map((bed) => [bed.id, bed]));
    const rates = loadCostRates(join(BAKEOFF_DIR, 'cost-rates.json'));
    const selected = onlyTurns ? turns.filter((turn) => onlyTurns.includes(turn.id)) : turns;
    if (onlyTurns && selected.length !== onlyTurns.length) {
        throw new Error(
            `Unknown turn ids: ${onlyTurns.filter((id) => !turns.some((turn) => turn.id === id)).join(', ')}`,
        );
    }

    const missingEnv = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'GOOGLE_API_KEY']
        .concat(VOICE_PROVIDER_KEYS[provider])
        .filter((name) => !process.env[name]);
    const missingDist = [
        join(AGENT_DIR, '..', 'packages', 'core', 'dist', 'index.js'),
        join(AGENT_DIR, '..', 'packages', 'infrastructure', 'dist', 'index.js'),
    ].filter((path) => !existsSync(path));
    if (missingDist.length > 0) {
        throw new Error(
            `Workspace packages are not built (${missingDist.join(', ')}). Run first: npm --workspace @lemonade/core run build && npm --workspace @lemonade/infrastructure run build`,
        );
    }

    // Resolve assets up front: a missing bed or clip skips its turns, and the
    // run says so instead of failing halfway through a live session.
    const bedCache = new Map<string, WavPcm>();
    const missingAsset = (turn: BakeoffTurn): string | null => {
        if (turn.noiseBed) {
            const bed: NoiseBed | undefined = beds.get(turn.noiseBed);
            if (!bed) return `unknown noise bed ${turn.noiseBed}`;
            const path = join(BAKEOFF_DIR, bed.file);
            if (!existsSync(path)) return `noise bed file missing: ${bed.file}`;
        }
        if (turn.clip && !existsSync(join(BAKEOFF_DIR, 'clips', turn.clip.still))) {
            return `clip still missing: clips/${turn.clip.still}`;
        }
        return null;
    };
    const bedFor = (turn: BakeoffTurn): WavPcm | null => {
        if (!turn.noiseBed) return null;
        const cached = bedCache.get(turn.noiseBed);
        if (cached) return cached;
        const bed = beds.get(turn.noiseBed);
        if (!bed) throw new Error(`Unknown noise bed ${turn.noiseBed}`);
        const wav = readWavPcm(join(BAKEOFF_DIR, bed.file), (path) => readFileSync(path));
        bedCache.set(turn.noiseBed, wav);
        return wav;
    };

    if (dryRun) {
        for (const turn of selected) {
            const missing = missingAsset(turn);
            console.log(
                `${turn.id} ${turn.category}${turn.noiseBed ? ` + ${turn.noiseBed}` : ''}${missing ? ` — SKIP: ${missing}` : ''}`,
            );
        }
        console.log(`Dry run OK: ${selected.length} turns for provider ${provider}.`);
        return;
    }

    // A dry run needs no keys and no room; a live run needs both.
    if (missingEnv.length > 0) {
        throw new Error(`Missing environment for a ${provider} bake-off run: ${missingEnv.join(', ')}`);
    }

    const roomName = `lemonade-bakeoff-${provider}-${Date.now()}`;
    const sessionId = roomName;
    let worker: ChildProcess | undefined;
    const room = new Room();
    const observations: BakeoffTurnObservation[] = [];
    let inputAudioMinutes = 0;
    let outputAudioMinutes = 0;
    let outputChars = 0;
    const startedAt = Date.now();
    let current: TurnAudioState | null = null;

    try {
        worker = spawn('npx', ['tsx', '--tsconfig', BAKEOFF_TSCONFIG, join(AGENT_DIR, 'src/worker.ts'), 'dev'], {
            cwd: AGENT_DIR,
            env: { ...process.env, VOICE_PROVIDER: provider },
            stdio: 'inherit',
        });
        await sleep(8_000);

        const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
            identity: 'bakeoff-driver',
            metadata: JSON.stringify({
                userId: 'bakeoff-driver',
                vehicleContext: JSON.stringify({ year: 2017, make: 'Toyota', model: 'Camry' }),
            }),
        });
        token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
        await room.connect(process.env.LIVEKIT_URL!, await token.toJwt(), { autoSubscribe: true, dynacast: false });

        room.registerTextStreamHandler('lk.transcription', async (reader, participant) => {
            if (participant.identity === 'bakeoff-driver') return;
            const text = await reader.readAll();
            current?.transcriptParts.push(text);
        });
        room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
            if (!current) return;
            if (topic === LiveChannelTopic.AiResponse) {
                try {
                    const message = JSON.parse(new TextDecoder().decode(payload)) as {
                        type?: string;
                        analysis?: { diagnosis?: string };
                    };
                    if (message.type === 'chat' && message.analysis?.diagnosis) {
                        current.aiResponseParts.push(message.analysis.diagnosis);
                    }
                } catch {
                    // A malformed data packet is dropped, not a failed turn.
                }
            }
            if (topic === LiveChannelTopic.VisualBurstRequest) {
                try {
                    const message = JSON.parse(new TextDecoder().decode(payload)) as {
                        component?: string;
                        reason?: string;
                    };
                    current.toolCalls.push({
                        name: 'start_video_stream',
                        args: { component: message.component ?? '', reason: message.reason ?? '' },
                    });
                    current.toolCallAtMs.push(Date.now() - current.promptEndedAt);
                } catch {
                    // Dropped, as above.
                }
            }
        });
        room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack) => {
            if (track.kind !== TrackKind.KIND_AUDIO) return;
            for await (const frame of new AudioStream(track)) {
                if (!current) continue;
                const atMs = Date.now() - current.promptEndedAt;
                const frameRms = rms(frame);
                current.quality.feed({ atMs, rms: frameRms, clippedFraction: clippedFraction(frame) });
                if (frameRms > 500) {
                    if (current.firstAudibleAtMs === null) current.firstAudibleAtMs = atMs;
                    current.lastAudibleAtMs = atMs;
                }
            }
        });

        const source = new AudioSource(SAMPLE_RATE, 1);
        const track = LocalAudioTrack.createAudioTrack('bakeoff-mic', source);
        const options = new TrackPublishOptions();
        options.source = TrackSource.SOURCE_MICROPHONE;
        await room.localParticipant?.publishTrack(track, options);

        for (const turn of selected) {
            const missing = missingAsset(turn);
            if (missing) {
                console.log(`${turn.id}: SKIP (${missing})`);
                observations.push({
                    turnId: turn.id,
                    transcript: '',
                    toolCalls: [],
                    spokeWhileToolRan: null,
                    timeToFirstAudioMs: null,
                    interruptStopMs: null,
                    crackles: 0,
                    dropouts: 0,
                    status: 'missing-asset',
                    error: missing,
                });
                continue;
            }
            console.log(`${turn.id} [${turn.category}]: speaking prompt...`);
            try {
                current = {
                    transcriptParts: [],
                    aiResponseParts: [],
                    toolCalls: [],
                    toolCallAtMs: [],
                    firstAudibleAtMs: null,
                    lastAudibleAtMs: null,
                    quality: new AudioQualityTracker(),
                    promptEndedAt: 0,
                };
                let pcm = await synthesizeSpeech(turn.prompt);
                const bed = bedFor(turn);
                if (bed) {
                    const bedAtSpeechRate = resampleLinear(bed.samples, bed.sampleRate, SAMPLE_RATE);
                    const bedDef = beds.get(turn.noiseBed as string);
                    pcm = mixNoise(pcm, bedAtSpeechRate, bedDef?.bedGainDb ?? -15);
                }
                inputAudioMinutes += pcm.length / SAMPLE_RATE / 60;
                await speak(source, pcm);
                current.promptEndedAt = Date.now();

                if (turn.clip) {
                    const still = readFileSync(join(BAKEOFF_DIR, 'clips', turn.clip.still));
                    await room.localParticipant?.publishData(
                        encodeLiveMessage({
                            frames: [still.toString('base64')],
                            metadata: { reason: turn.prompt, sessionId, timestamp: Date.now() },
                        }),
                        { reliable: true, topic: LiveChannelTopic.VisualBurstResponse },
                    );
                }

                // Wait for the reply: first audio, then silence, or timeout.
                // Interruption turns break out as soon as the agent starts
                // speaking, so the interrupt lands mid-answer, not after it.
                const replyStarted = Date.now();
                while (Date.now() - replyStarted < REPLY_TIMEOUT_MS) {
                    if (current.firstAudibleAtMs !== null && turn.interrupt) break;
                    if (current.firstAudibleAtMs !== null && current.lastAudibleAtMs !== null) {
                        if (Date.now() - current.promptEndedAt - current.lastAudibleAtMs > SILENCE_END_MS) break;
                    }
                    await sleep(200);
                }

                let interruptStopMs: number | null = null;
                if (turn.interrupt && current.firstAudibleAtMs !== null) {
                    // afterMs counts from the first audible agent audio.
                    const sinceFirstAudio = Date.now() - current.promptEndedAt - current.firstAudibleAtMs;
                    await sleep(Math.max(0, turn.interrupt.afterMs - sinceFirstAudio));
                    await speak(source, await synthesizeSpeech(turn.interrupt.phrase));
                    const interruptEnded = Date.now();
                    // Give the agent up to 10 s to stop, then read the last
                    // audible frame after the interrupt ended.
                    const stopDeadline = Date.now() + 10_000;
                    while (Date.now() < stopDeadline) {
                        if (
                            current.lastAudibleAtMs !== null &&
                            Date.now() - current.promptEndedAt - current.lastAudibleAtMs > 1_000
                        )
                            break;
                        await sleep(100);
                    }
                    interruptStopMs =
                        current.lastAudibleAtMs === null
                            ? 0
                            : Math.max(0, current.lastAudibleAtMs - (interruptEnded - current.promptEndedAt));
                }

                const transcript =
                    current.transcriptParts.join(' ').trim() || [...new Set(current.aiResponseParts)].join(' ').trim();
                const quality = current.quality.finish();
                outputAudioMinutes += quality.audibleMs / 60_000;
                outputChars += transcript.length;
                const spokeWhileToolRan =
                    current.toolCalls.length === 0
                        ? null
                        : current.toolCallAtMs.some(
                              (atMs) => current !== null && (current.lastAudibleAtMs ?? -1) > atMs,
                          );
                observations.push({
                    turnId: turn.id,
                    transcript,
                    toolCalls: current.toolCalls,
                    spokeWhileToolRan,
                    timeToFirstAudioMs: current.firstAudibleAtMs,
                    interruptStopMs,
                    crackles: quality.crackles,
                    dropouts: quality.dropouts,
                    status: current.firstAudibleAtMs === null ? 'no-reply' : 'scored',
                });
                console.log(
                    `${turn.id}: ${current.firstAudibleAtMs === null ? 'no reply' : `TTFA ${current.firstAudibleAtMs} ms`} | transcript: ${transcript.slice(0, 120)}`,
                );
            } catch (error) {
                console.error(`${turn.id}: ERROR ${(error as Error).message}`);
                observations.push({
                    turnId: turn.id,
                    transcript: '',
                    toolCalls: [],
                    spokeWhileToolRan: null,
                    timeToFirstAudioMs: null,
                    interruptStopMs: null,
                    crackles: 0,
                    dropouts: 0,
                    status: 'error',
                    error: (error as Error).message,
                });
            } finally {
                current = null;
            }
        }
    } finally {
        await room.disconnect();
        worker?.kill('SIGTERM');
    }

    const sessionMinutes = (Date.now() - startedAt) / 60_000;
    const run = scoreRun(
        provider,
        selected,
        observations,
        { inputAudioMinutes, outputAudioMinutes, outputChars, sessionMinutes },
        rates,
    );
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${provider}-${stamp}.json`), JSON.stringify({ run, observations }, null, 2));
    const table = renderResultsTable(run);
    writeFileSync(join(outDir, `${provider}-${stamp}.md`), `${table}\n`);
    console.log(`\n${table}`);
    console.log(`Results written to ${outDir}/${provider}-${stamp}.{json,md}`);
}

main().catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
});
