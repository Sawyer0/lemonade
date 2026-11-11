import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    GEMINI_LIVE_MODEL,
    GROK_VOICE_MODEL,
    CARTESIA_TTS_MODEL,
    DEEPGRAM_STT_MODEL,
    GEMINI_FLASH_MODEL,
    LiveChannelTopic,
    decodeLiveMessage,
    encodeLiveMessage,
    AiResponseMessageSchema,
} from '@lemonade/core';
import { detection } from './fakes';

// Starting the worker re-imports the agent and the native RTC bindings after
// vi.resetModules, which takes seconds on a cold cache: the default 5s test
// timeout trips on it. Same 30s allowance as the integration tests.
vi.setConfig({ testTimeout: 30_000 });

const CASE_ID = '123e4567-e89b-12d3-a456-426614174000';

/**
 * Starts the real worker entry (livekit-agent.ts) against a fake room and a
 * fake AgentSession, so the wiring is checked without LiveKit or Gemini.
 */
const fakes = vi.hoisted(() => {
    class FakeSession {
        handlers = new Map<string, (event: unknown) => void>();
        start = vi.fn(async (_options: { agent: FakeAgent; room: unknown }) => {});
        generateReply = vi.fn(() => ({ waitForPlayout: async () => {} }));
        constructor(public options: Record<string, unknown>) {
            fakes.sessions.push(this);
        }
        on(event: string, handler: (event: unknown) => void) {
            this.handlers.set(event, handler);
        }
    }
    class FakeAgent {
        constructor(public options: { instructions: string; tools: Record<string, unknown> }) {}
    }
    return {
        sessions: [] as FakeSession[],
        FakeSession,
        FakeAgent,
        geminiRealtime: vi.fn((options: unknown) => ({ fake: 'gemini-realtime-model', options })),
        grokRealtime: vi.fn((options: unknown) => ({ fake: 'grok-realtime-model', options })),
        deepgramStt: vi.fn((options: unknown) => ({ fake: 'deepgram-stt', options })),
        geminiChat: vi.fn((options: unknown) => ({ fake: 'gemini-chat-model', options })),
        cartesiaTts: vi.fn((options: unknown) => ({ fake: 'cartesia-tts', options })),
        vadLoad: vi.fn(async () => ({ fake: 'vad' })),
        appendEntry: vi.fn(async () => ({})),
        repo: null as unknown as { appendEntry: (...args: unknown[]) => Promise<unknown> },
    };
});
const { sessions, geminiRealtime, grokRealtime, deepgramStt, geminiChat, cartesiaTts, vadLoad, appendEntry } = fakes;
fakes.repo = { appendEntry: fakes.appendEntry };

// Event names match @livekit/agents and @livekit/rtc-node; the real modules load native code.
vi.mock('@livekit/agents', () => ({
    defineAgent: (agent: unknown) => agent,
    voice: {
        AgentSession: fakes.FakeSession,
        Agent: fakes.FakeAgent,
        AgentSessionEventTypes: {
            ConversationItemAdded: 'conversation_item_added',
            UserInputTranscribed: 'user_input_transcribed',
        },
    },
    llm: { tool: (definition: unknown) => definition },
}));
vi.mock('@livekit/rtc-node', () => ({ RoomEvent: { DataReceived: 'dataReceived' } }));
vi.mock('@livekit/agents-plugin-silero', () => ({ VAD: { load: fakes.vadLoad } }));
vi.mock('../src/voice/livekitPlugins', () => ({
    livekitPlugins: {
        geminiRealtime: fakes.geminiRealtime,
        grokRealtime: fakes.grokRealtime,
        deepgramStt: fakes.deepgramStt,
        geminiChat: fakes.geminiChat,
        cartesiaTts: fakes.cartesiaTts,
    },
}));
vi.mock('@lemonade/infrastructure', () => ({
    Logger: class {
        info() {}
        warn() {}
        error() {}
        debug() {}
    },
    TYPES: {
        CaseRepo: Symbol.for('CaseRepo'),
        MechanicReasoningService: Symbol.for('MechanicReasoningService'),
        LiveStreamAI: Symbol.for('LiveStreamAI'),
    },
    createContainer: () => ({ get: () => fakes.repo }),
}));

function fakeRoom() {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const published: { data: Uint8Array; topic?: string }[] = [];
    return {
        listeners,
        published,
        room: {
            name: 'session-42',
            on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
            localParticipant: {
                publishData: vi.fn(async (data: Uint8Array, options: { topic?: string }) => {
                    published.push({ data, topic: options.topic });
                }),
            },
        },
    };
}

const DEFAULT_METADATA = JSON.stringify({ vehicleContext: { year: 2016, make: 'Toyota', model: 'Camry' } });

async function startWorker(metadata: string = DEFAULT_METADATA) {
    const { default: agent } = (await import('../src/livekit-agent')) as unknown as {
        default: {
            prewarm: (proc: { userData: Record<string, unknown> }) => Promise<void>;
            entry: (ctx: unknown) => Promise<void>;
        };
    };
    const proc = { userData: {} as Record<string, unknown> };
    await agent.prewarm(proc);

    const room = fakeRoom();
    const ctx = {
        proc,
        room: room.room,
        connect: vi.fn(async () => {}),
        waitForParticipant: vi.fn(async () => ({
            identity: 'user-7',
            metadata,
        })),
    };
    await agent.entry(ctx);
    return { ctx, room, proc, session: sessions.at(-1)! };
}

describe('agent worker startup', () => {
    beforeEach(() => {
        sessions.length = 0;
        appendEntry.mockClear();
        geminiRealtime.mockClear();
        grokRealtime.mockClear();
        deepgramStt.mockClear();
        geminiChat.mockClear();
        cartesiaTts.mockClear();
        vi.resetModules();
        vi.unstubAllEnvs();
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('GOOGLE_API_KEY', 'fake-key');
    });

    it.each([
        {
            id: 'gemini',
            env: {},
            llm: { fake: 'gemini-realtime-model' },
            stt: undefined,
            tts: undefined,
            builder: geminiRealtime,
            model: GEMINI_LIVE_MODEL,
        },
        {
            id: 'grok',
            env: { XAI_API_KEY: 'x-key' },
            llm: { fake: 'grok-realtime-model' },
            stt: undefined,
            tts: undefined,
            builder: grokRealtime,
            model: GROK_VOICE_MODEL,
        },
        {
            id: 'cascade',
            env: { DEEPGRAM_API_KEY: 'd-key', CARTESIA_API_KEY: 'c-key' },
            llm: { fake: 'gemini-chat-model' },
            stt: { fake: 'deepgram-stt' },
            tts: { fake: 'cartesia-tts' },
            builder: geminiChat,
            model: GEMINI_FLASH_MODEL,
        },
    ])(
        'prewarms the VAD, joins the room and starts a $id Master Tech session',
        async ({ id, env, llm, stt, tts, builder, model }) => {
            if (id !== 'gemini') vi.stubEnv('VOICE_PROVIDER', id);
            for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
            const { ctx, proc, session } = await startWorker();

            expect(vadLoad).toHaveBeenCalled();
            expect(proc.userData.vad).toEqual({ fake: 'vad' });
            expect(ctx.connect).toHaveBeenCalled();
            expect(session.options).toMatchObject({ vad: { fake: 'vad' }, llm });
            if (stt === undefined) {
                expect(session.options.stt).toBeUndefined();
                expect(session.options.tts).toBeUndefined();
            } else {
                expect(session.options).toMatchObject({ stt, tts });
            }
            expect(builder).toHaveBeenCalledWith(expect.objectContaining({ model }));
            if (id === 'cascade') {
                expect(deepgramStt).toHaveBeenCalledWith(expect.objectContaining({ model: DEEPGRAM_STT_MODEL }));
                expect(cartesiaTts).toHaveBeenCalledWith(expect.objectContaining({ model: CARTESIA_TTS_MODEL }));
            }

            const { agent, room } = session.start.mock.calls[0][0];
            expect(room).toBe(ctx.room);
            expect(agent.options.instructions).toContain('2016 Toyota Camry');
            expect(Object.keys(agent.options.tools).length).toBeGreaterThan(0);
        },
    );

    it('routes typed messages from the session user to the model and ignores others', async () => {
        const { room, session } = await startWorker();
        const onData = room.listeners.get('dataReceived')!;
        const packet = encodeLiveMessage({ text: 'It squeals when I brake', sessionId: 'session-42', timestamp: 1 });

        onData(packet, { identity: 'someone-else' }, undefined, LiveChannelTopic.UserMessage);
        onData(packet, { identity: 'user-7' }, undefined, LiveChannelTopic.UserMessage);
        await Promise.resolve();

        expect(session.generateReply).toHaveBeenCalledTimes(1);
        expect(session.generateReply).toHaveBeenCalledWith({ userInput: 'It squeals when I brake' });
    });

    it('speaks a risky proactive ping through generateReply, not say', async () => {
        const { room, session } = await startWorker();
        const onData = room.listeners.get('dataReceived')!;
        const ping = encodeLiveMessage({
            type: 'PROACTIVE_PING',
            detection: detection('Brake Rotor', 'Braking', true),
            sessionId: 'session-42',
            timestamp: 1,
        });

        onData(ping, { identity: 'user-7' }, undefined, LiveChannelTopic.ProactivePing);
        await Promise.resolve();

        expect(session.generateReply).toHaveBeenCalledWith({
            instructions: expect.stringContaining('Brake Rotor'),
        });
    });

    it('mirrors what the agent says into the client transcript', async () => {
        const { room, session } = await startWorker();
        const added = session.handlers.get('conversation_item_added')!;

        // Real chat items carry type 'message'; a handoff item must be ignored.
        added({ item: { type: 'message', role: 'assistant', textContent: 'Check the brake pads first.' } });
        added({ item: { type: 'message', role: 'user', textContent: 'ignored' } });
        added({ item: { type: 'agent_handoff', oldAgentId: 'a', newAgentId: 'b' } });
        await Promise.resolve();

        expect(room.published).toHaveLength(1);
        expect(room.published[0].topic).toBe(LiveChannelTopic.AiResponse);
        expect(decodeLiveMessage(AiResponseMessageSchema, room.published[0].data)).toMatchObject({
            type: 'chat',
            analysis: { diagnosis: 'Check the brake pads first.' },
        });
    });

    it('records user and assistant turns in the case ledger', async () => {
        const metadata = JSON.stringify({
            userId: 'user-7',
            caseId: CASE_ID,
            vehicleContext: JSON.stringify({ year: 2016, make: 'Toyota', model: 'Camry' }),
        });
        const { session } = await startWorker(metadata);
        const transcribed = session.handlers.get('user_input_transcribed')!;
        const added = session.handlers.get('conversation_item_added')!;

        transcribed({ transcript: 'My brakes squeal', isFinal: false });
        transcribed({ transcript: 'My brakes squeal when I stop', isFinal: true });
        added({ item: { type: 'message', role: 'assistant', textContent: 'Check the brake pads first.' } });
        await Promise.resolve();

        expect(appendEntry).toHaveBeenCalledTimes(2);
        expect(appendEntry).toHaveBeenNthCalledWith(
            1,
            CASE_ID,
            expect.objectContaining({
                type: 'transcript',
                payload: { role: 'user', text: 'My brakes squeal when I stop', provider: 'gemini' },
            }),
        );
        expect(appendEntry).toHaveBeenNthCalledWith(
            2,
            CASE_ID,
            expect.objectContaining({
                type: 'transcript',
                payload: { role: 'assistant', text: 'Check the brake pads first.', provider: 'gemini' },
            }),
        );
    });

    it('does not touch the ledger without a case id', async () => {
        const { session } = await startWorker();
        session.handlers.get('user_input_transcribed')!({ transcript: 'My brakes squeal', isFinal: true });
        session.handlers.get('conversation_item_added')!({
            item: { type: 'message', role: 'assistant', textContent: 'Check the brake pads first.' },
        });
        await Promise.resolve();

        expect(appendEntry).not.toHaveBeenCalled();
    });
});
