import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveChannelTopic, decodeLiveMessage, encodeLiveMessage, AiResponseMessageSchema } from '@lemonade/core';

/**
 * Starts the real worker entry (livekit-agent.ts) against a fake room and a
 * fake AgentSession, so the wiring is checked without LiveKit or Gemini.
 */
const fakes = vi.hoisted(() => {
    class FakeSession {
        handlers = new Map<string, (event: unknown) => void>();
        start = vi.fn(async (_options: { agent: FakeAgent; room: unknown }) => {});
        say = vi.fn(() => ({ waitForPlayout: async () => {} }));
        generateReply = vi.fn();
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
        realtimeModel: vi.fn((options: unknown) => ({ fake: 'realtime-model', options })),
        vadLoad: vi.fn(async () => ({ fake: 'vad' })),
    };
});
const { sessions, realtimeModel, vadLoad } = fakes;

// Event names match @livekit/agents and @livekit/rtc-node; the real modules load native code.
vi.mock('@livekit/agents', () => ({
    defineAgent: (agent: unknown) => agent,
    voice: {
        AgentSession: fakes.FakeSession,
        Agent: fakes.FakeAgent,
        AgentSessionEventTypes: { ConversationItemAdded: 'conversation_item_added' },
    },
    llm: { tool: (definition: unknown) => definition },
}));
vi.mock('@livekit/rtc-node', () => ({ RoomEvent: { DataReceived: 'dataReceived' } }));
vi.mock('@livekit/agents-plugin-silero', () => ({ VAD: { load: fakes.vadLoad } }));
vi.mock('../src/voice/livekitVoiceProviders', () => ({
    livekitVoiceProviders: { realtimeModel: fakes.realtimeModel, resembleTts: vi.fn() },
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

async function startWorker() {
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
            metadata: JSON.stringify({ vehicleContext: { year: 2016, make: 'Toyota', model: 'Camry' } }),
        })),
    };
    await agent.entry(ctx);
    return { ctx, room, proc, session: sessions.at(-1)! };
}

describe('agent worker startup', () => {
    beforeEach(() => {
        sessions.length = 0;
        vi.resetModules();
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('GOOGLE_API_KEY', 'fake-key');
        vi.stubEnv('RESEMBLE_API_KEY', '');
    });

    it('prewarms the VAD, joins the room and starts a Master Tech session', async () => {
        const { ctx, proc, session } = await startWorker();

        expect(vadLoad).toHaveBeenCalled();
        expect(proc.userData.vad).toEqual({ fake: 'vad' });
        expect(ctx.connect).toHaveBeenCalled();
        expect(session.options).toMatchObject({ vad: { fake: 'vad' }, llm: { fake: 'realtime-model' } });
        expect(session.options.tts).toBeUndefined();
        expect(realtimeModel).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'fake-key', reply: 'audio' }));

        const { agent, room } = session.start.mock.calls[0][0];
        expect(room).toBe(ctx.room);
        expect(agent.options.instructions).toContain('2016 Toyota Camry');
        expect(Object.keys(agent.options.tools).length).toBeGreaterThan(0);
    });

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

    it('mirrors what the agent says into the client transcript', async () => {
        const { room, session } = await startWorker();
        const added = session.handlers.get('conversation_item_added')!;

        added({ item: { role: 'assistant', textContent: 'Check the brake pads first.' } });
        added({ item: { role: 'user', textContent: 'ignored' } });
        await Promise.resolve();

        expect(room.published).toHaveLength(1);
        expect(room.published[0].topic).toBe(LiveChannelTopic.AiResponse);
        expect(decodeLiveMessage(AiResponseMessageSchema, room.published[0].data)).toMatchObject({
            type: 'chat',
            analysis: { diagnosis: 'Check the brake pads first.' },
        });
    });
});
