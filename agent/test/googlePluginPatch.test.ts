import { inflateSync } from 'node:zlib';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as google from '@livekit/agents-plugin-google';
import { Behavior, LiveServerMessage } from '@google/genai';
import { VideoFrame, VideoBufferType } from '@livekit/rtc-node';
import { initializeLogger, llm } from '@livekit/agents';
import { GEMINI_LIVE_MODEL } from '@lemonade/core';

/**
 * LM-13: the patched `@livekit/agents-plugin-google` 1.9.5 (see
 * `patches/@livekit+agents-plugin-google+1.9.5.patch`) drives the real
 * `RealtimeModel` against a fake Gemini socket: the mocked `live.connect()`
 * captures the server callbacks and records every `sendRealtimeInput` and
 * `sendToolResponse`. These tests fail on the unpatched 1.9.5: `pushVideo`
 * is a no-op so no video ever reaches the socket, and a second
 * `input_speech_started` fires while a NON_BLOCKING tool call is pending.
 *
 * The mock targets the `@google/genai` the plugin itself loads: npm nests a
 * v2 copy under the plugin (`node_modules/@livekit/agents-plugin-google/
 * node_modules/@google/genai`) because the hoisted root copy is v1, and the
 * agent workspace has its own nested v2 copy. `vi.mock` only intercepts the
 * exact module instance the importer resolves to, so mocking the bare
 * specifier (the agent's copy, which this file also imports for `Behavior`)
 * would leave the plugin talking to the real client.
 */
const fakeSocket = vi.hoisted(() => ({
    callbacks: undefined as
        | {
              onopen: () => void;
              onmessage: (message: LiveServerMessage) => void;
              onerror: (error: ErrorEvent) => void;
              onclose: (event: CloseEvent) => void;
          }
        | undefined,
    realtimeInputs: [] as unknown[],
    toolResponses: [] as unknown[],
}));

type FakeCallbacks = NonNullable<typeof fakeSocket.callbacks>;

vi.mock('../../node_modules/@livekit/agents-plugin-google/node_modules/@google/genai', async (importOriginal) => {
    // The mocked copy is the same v2 as the agent's own `@google/genai`,
    // so the module type is identical; the relative path just gives TS no
    // type to infer for `importOriginal()`.
    const actual = (await importOriginal()) as typeof import('@google/genai');
    return {
        ...actual,
        GoogleGenAI: class {
            live = {
                connect: async ({ callbacks }: { callbacks: FakeCallbacks }) => {
                    fakeSocket.callbacks = callbacks;
                    callbacks.onopen();
                    return {
                        sendClientContent: async () => undefined,
                        sendRealtimeInput: async (params: unknown) => {
                            fakeSocket.realtimeInputs.push(params);
                        },
                        sendToolResponse: async (params: unknown) => {
                            fakeSocket.toolResponses.push(params);
                        },
                        close: async () => undefined,
                    };
                },
            };
        },
    };
});

const AUDIO_PART = {
    inlineData: { data: Buffer.from([0, 0, 0, 0]).toString('base64'), mimeType: 'audio/pcm' },
};

/** The patched session keeps these internals; the public types do not expose them. */
interface SessionInternals {
    activeSession: unknown;
    pendingToolCallIds: Set<string>;
}

async function openSession(options: ConstructorParameters<typeof google.realtime.RealtimeModel>[0] = {}) {
    fakeSocket.callbacks = undefined;
    fakeSocket.realtimeInputs = [];
    fakeSocket.toolResponses = [];
    const session = new google.realtime.RealtimeModel({
        model: GEMINI_LIVE_MODEL,
        apiKey: 'test-api-key',
        ...options,
    }).session();
    const generations: llm.GenerationCreatedEvent[] = [];
    session.on('generation_created', (event) => {
        generations.push(event);
    });
    const internals = session as unknown as SessionInternals;
    await vi.waitFor(() => expect(internals.activeSession).toBeDefined());
    return {
        session,
        generations,
        // The plugin reads `text`/`data` getters off the message, so the
        // scripted messages are real `LiveServerMessage` instances, not
        // plain literals (a literal cannot satisfy the class type).
        serverSends: (spec: Partial<LiveServerMessage>) => {
            const message = new LiveServerMessage();
            Object.assign(message, spec);
            fakeSocket.callbacks?.onmessage(message);
        },
    };
}

type Rgb = [number, number, number];

function rgbaFrame(width: number, height: number, paint: (x: number, y: number) => Rgb): VideoFrame {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [red, green, blue] = paint(x, y);
            const offset = (y * width + x) * 4;
            rgba[offset] = red;
            rgba[offset + 1] = green;
            rgba[offset + 2] = blue;
            rgba[offset + 3] = 255;
        }
    }
    return new VideoFrame(rgba, width, height, VideoBufferType.RGBA);
}

interface DecodedPng {
    width: number;
    height: number;
    /** Row-major RGB bytes, filter bytes removed. */
    pixels: Buffer;
}

/** Decodes the PNGs the patch emits, asserting structure, not just that bytes arrived. */
function readPng(pngBytes: Buffer): DecodedPng {
    expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    let offset = 8;
    let width = 0;
    let height = 0;
    const idat: Buffer[] = [];
    while (offset < pngBytes.length) {
        const length = pngBytes.readUInt32BE(offset);
        const type = pngBytes.toString('ascii', offset + 4, offset + 8);
        const chunk = pngBytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            expect(chunk[8]).toBe(8);
            expect(chunk[9]).toBe(2);
        }
        if (type === 'IDAT') {
            idat.push(Buffer.from(chunk));
        }
        if (type === 'IEND') {
            break;
        }
        offset += 12 + length;
    }
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * 3;
    const pixels = Buffer.alloc(width * height * 3);
    let previousRow: Buffer | undefined;
    for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (stride + 1)];
        const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const targetRow = pixels.subarray(y * stride, (y + 1) * stride);
        for (let i = 0; i < stride; i += 1) {
            const stored = row[i] as number;
            if (filter === 0) {
                targetRow[i] = stored;
            } else if (filter === 2) {
                targetRow[i] = (stored + (previousRow?.[i] ?? 0)) % 256;
            } else {
                throw new Error(`unexpected PNG filter ${filter}`);
            }
        }
        previousRow = Buffer.from(targetRow);
    }
    return { width, height, pixels };
}

interface RealtimeVideoInput {
    video?: { mimeType?: string; data?: string };
}

function sentVideoInput(): RealtimeVideoInput {
    return fakeSocket.realtimeInputs[0] as RealtimeVideoInput;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe('LM-13 patched Google plugin: video frames reach Gemini', () => {
    beforeAll(() => {
        initializeLogger({ pretty: false, level: 'info' });
    });

    it('forwards a video frame as realtimeInput.video with the frame pixels', async () => {
        const { session } = await openSession();
        session.pushVideo(rgbaFrame(4, 2, (x, y) => [x * 60, y * 100, 30]));
        await vi.waitFor(() => expect(fakeSocket.realtimeInputs).toHaveLength(1));
        const video = sentVideoInput().video;
        expect(video?.mimeType).toBe('image/png');
        const decoded = readPng(Buffer.from(video?.data ?? '', 'base64'));
        expect(decoded.width).toBe(4);
        expect(decoded.height).toBe(2);
        expect(decoded.pixels[3]).toBe(60);
        expect(decoded.pixels[4]).toBe(0);
        expect(decoded.pixels[5]).toBe(30);
        expect(decoded.pixels[12 + 1]).toBe(100);
    });

    it('sends at most one frame per second: Gemini Live caps video at 1 fps', async () => {
        const { session } = await openSession();
        const frame = rgbaFrame(2, 2, () => [1, 2, 3]);
        session.pushVideo(frame);
        session.pushVideo(frame);
        session.pushVideo(frame);
        await vi.waitFor(() => expect(fakeSocket.realtimeInputs).toHaveLength(1));
        await delay(50);
        expect(fakeSocket.realtimeInputs).toHaveLength(1);
    });

    it('resizes a frame larger than the encode options to fit 1024x1024', async () => {
        const { session } = await openSession();
        session.pushVideo(rgbaFrame(2048, 1024, () => [9, 9, 9]));
        await vi.waitFor(() => expect(fakeSocket.realtimeInputs).toHaveLength(1));
        const decoded = readPng(Buffer.from(sentVideoInput().video?.data ?? '', 'base64'));
        expect(decoded.width).toBe(1024);
        expect(decoded.height).toBe(512);
    });

    it('converts a non-RGBA frame before sending', async () => {
        const { session } = await openSession();
        const i420 = new VideoFrame(new Uint8Array([16, 16, 16, 16, 128, 128]), 2, 2, VideoBufferType.I420);
        session.pushVideo(i420);
        await vi.waitFor(() => expect(fakeSocket.realtimeInputs).toHaveLength(1));
        const decoded = readPng(Buffer.from(sentVideoInput().video?.data ?? '', 'base64'));
        expect(decoded.width).toBe(2);
        expect(decoded.height).toBe(2);
    });

    it('drops a frame with no pixels instead of crashing the session', async () => {
        const { session } = await openSession();
        session.pushVideo(new VideoFrame(new Uint8Array(0), 0, 0, VideoBufferType.RGBA));
        await delay(50);
        expect(fakeSocket.realtimeInputs).toHaveLength(0);
    });
});

describe('LM-13 patched Google plugin: non-blocking tool results survive the model talking', () => {
    beforeAll(() => {
        initializeLogger({ pretty: false, level: 'info' });
    });

    /**
     * The user asks, the model calls a NON_BLOCKING tool (the plugin answers
     * `willContinue` at once) and keeps talking in a generation of its own
     * while the tool runs. Ported from livekit/agents-js PR #2594.
     */
    async function modelTalksDuringToolCall() {
        const opened = await openSession({ toolBehavior: Behavior.NON_BLOCKING });
        const speechStarted = vi.fn();
        opened.session.on('input_speech_started', speechStarted);
        opened.serverSends({ serverContent: { inputTranscription: { text: 'Find me a house' } } });
        opened.serverSends({
            toolCall: { functionCalls: [{ id: 'fc-1', name: 'searchHouses', args: {} }] },
        });
        opened.serverSends({ serverContent: { modelTurn: { parts: [AUDIO_PART] } } });
        await vi.waitFor(() => expect(opened.generations).toHaveLength(2));
        return { ...opened, speechStarted };
    }

    it("does not report the model's own generation as user speech", async () => {
        const { generations, speechStarted } = await modelTalksDuringToolCall();
        // Only the user's turn. A second event interrupts the speech that owns the tool call,
        // and the tool's result is never sent.
        expect(speechStarted).toHaveBeenCalledTimes(1);
        expect(generations[1]?.userInitiated).toBe(false);
    });

    it('still reports a barge-in', async () => {
        const { serverSends, speechStarted } = await modelTalksDuringToolCall();
        const before = speechStarted.mock.calls.length;
        serverSends({ serverContent: { interrupted: true } });
        await vi.waitFor(() => expect(speechStarted).toHaveBeenCalledTimes(before + 1));
    });

    it('still reports the user starting a new turn', async () => {
        const { generations, serverSends, speechStarted } = await modelTalksDuringToolCall();
        serverSends({ serverContent: { turnComplete: true } });
        const before = speechStarted.mock.calls.length;
        serverSends({ serverContent: { inputTranscription: { text: 'With a pool' } } });
        await vi.waitFor(() => expect(generations).toHaveLength(3));
        expect(speechStarted).toHaveBeenCalledTimes(before + 1);
    });

    it("sends the final tool response once the tool finishes, and reports the model's next generation", async () => {
        const { session, generations, serverSends, speechStarted } = await modelTalksDuringToolCall();
        serverSends({ serverContent: { turnComplete: true } });
        const chatCtx = session.chatCtx.copy();
        chatCtx.insert([
            llm.FunctionCall.create({ callId: 'fc-1', name: 'searchHouses', args: '{}' }),
            llm.FunctionCallOutput.create({
                callId: 'fc-1',
                name: 'searchHouses',
                output: '3 houses',
                isError: false,
            }),
        ]);
        await session.updateChatCtx(chatCtx);
        const internals = session as unknown as SessionInternals;
        await vi.waitFor(() => expect(internals.pendingToolCallIds.size).toBe(0));
        const finalResponse = fakeSocket.toolResponses.at(-1) as {
            functionResponses: { id?: string; willContinue?: boolean }[];
        };
        expect(finalResponse.functionResponses[0]?.id).toBe('fc-1');
        // 1.9.5 pairs the immediate `willContinue: true` with an explicit
        // `false` on the final response (it is the "call is done" signal);
        // the regression would be a missing response or a `true` here.
        expect(finalResponse.functionResponses[0]?.willContinue).toBe(false);
        const before = speechStarted.mock.calls.length;
        // With no call pending, a new generation cuts any playout left, as before.
        serverSends({ serverContent: { modelTurn: { parts: [AUDIO_PART] } } });
        await vi.waitFor(() => expect(generations).toHaveLength(3));
        expect(speechStarted).toHaveBeenCalledTimes(before + 1);
    });
});
