import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    AIAnalysis,
    IBillingService,
    ILogger,
    ISessionRepository,
    IUserRepository,
    MessagePart,
} from '@lemonade/core';
import { SHARED_CONFIG } from '@lemonade/core';
import type { TracingService } from '../../../observability/TracingService';
import { LiveStreamAnalyzer } from '../LiveStreamAnalyzer';
import { FakeMediaModel, VALID_ANALYSIS } from './fakeMediaModel';

describe('LiveStreamAnalyzer', () => {
    let model: FakeMediaModel;
    let billing: IBillingService;
    let users: IUserRepository;
    let sessions: ISessionRepository;
    let analyzer: LiveStreamAnalyzer;
    let logger: ILogger;

    const session = (overrides: Record<string, unknown> = {}) => ({
        cumulativeVideoDurationProcessedMinutes: 0,
        cumulativeAudioDurationProcessedMinutes: 0,
        ...overrides,
    });

    beforeEach(() => {
        model = new FakeMediaModel();
        billing = { recordUsage: vi.fn().mockResolvedValue(undefined) } as unknown as IBillingService;
        users = { findById: vi.fn().mockResolvedValue({ tier: 'pro' }) } as unknown as IUserRepository;
        sessions = {
            findById: vi.fn().mockResolvedValue(session()),
            updateLastProcessedFrameTimestamp: vi.fn().mockResolvedValue(undefined),
            updateCumulativeVideoDuration: vi.fn().mockResolvedValue(undefined),
            updateLastProcessedAudioChunkTimestamp: vi.fn().mockResolvedValue(undefined),
            updateCumulativeAudioDuration: vi.fn().mockResolvedValue(undefined),
        } as unknown as ISessionRepository;
        logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
        const tracer = { traceAiCall: vi.fn(({ exec }) => exec()) } as unknown as TracingService;
        analyzer = new LiveStreamAnalyzer(model, billing, users, sessions, tracer, logger);
    });

    describe('analyzeLiveImageFrame', () => {
        it('analyzes a frame inline, bills it and books two seconds of quota', async () => {
            model.reply(JSON.stringify(VALID_ANALYSIS), { usage: { inputTokens: 50, outputTokens: 10 } });

            const result = await analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1', 'VIN1', 1000);

            expect((result as AIAnalysis).diagnosis).toBe('Worn serpentine belt');
            expect(model.requests[0]).toMatchObject({
                media: { kind: 'image', mimeType: 'image/jpeg', data: 'b64' },
                structured: true,
                realtime: true,
                tools: { userId: 'u1', sessionId: 's1', vin: 'VIN1' },
            });
            expect(billing.recordUsage).toHaveBeenCalledWith(
                expect.objectContaining({ inputTokens: 50, outputTokens: 10, model: 'fake-media-model' }),
            );
            expect(sessions.updateLastProcessedFrameTimestamp).toHaveBeenCalledWith('s1', 1000);
            expect(sessions.updateCumulativeVideoDuration).toHaveBeenCalledWith('s1', 2 / 60);
        });

        it('includes on-device triage as grounding', async () => {
            model.reply(JSON.stringify(VALID_ANALYSIS));
            await analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1', undefined, undefined, {
                detections: [],
                timestamp: 1,
                primaryIssue: 'belt',
                confidence: 0.9,
            });
            expect(model.requests[0].prompt).toContain('LOCAL PERCEPTION GROUNDING');
        });

        it('passes tool calls to the client without booking quota', async () => {
            model.reply('Opening the camera.', {
                toolCalls: [{ name: 'start_video_stream', args: { component: 'belt' } }],
            });

            const result = (await analyzer.analyzeLiveImageFrame(
                'b64',
                'image/jpeg',
                'Civic',
                'u1',
                's1',
            )) as MessagePart[];

            expect(result[0]).toEqual({ type: 'text', text: 'Opening the camera.' });
            expect(result[1]).toMatchObject({
                type: 'tool-call',
                toolName: 'start_video_stream',
                args: { component: 'belt' },
            });
            expect(sessions.updateCumulativeVideoDuration).not.toHaveBeenCalled();
        });

        it('rejects free users', async () => {
            (users.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ tier: 'free' });
            await expect(analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1')).rejects.toThrow(
                'Free users do not have access to live video analysis.',
            );
        });

        it('rejects unknown users and sessions', async () => {
            (users.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
            await expect(analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1')).rejects.toThrow(
                'User not found',
            );
            (sessions.findById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
            await expect(analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1')).rejects.toThrow(
                'Session with ID s1 not found.',
            );
        });

        it('enforces the per-session video quota', async () => {
            (sessions.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
                session({ cumulativeVideoDurationProcessedMinutes: 35 }),
            );
            await expect(analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1')).rejects.toThrow(
                'limit of 35 minutes',
            );
        });

        it('drops frames that arrive too soon after the last one', async () => {
            (sessions.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
                session({ lastProcessedFrameTimestamp: 1000 }),
            );
            const result = await analyzer.analyzeLiveImageFrame(
                'b64',
                'image/jpeg',
                'Civic',
                'u1',
                's1',
                undefined,
                1001,
            );
            expect(result).toBeNull();
            expect(model.requests).toHaveLength(0);
        });

        it('logs and rethrows an empty reply', async () => {
            model.reply(null);
            await expect(analyzer.analyzeLiveImageFrame('b64', 'image/jpeg', 'Civic', 'u1', 's1')).rejects.toThrow(
                'AI returned empty response from image frame analysis',
            );
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('analyzeLiveAudioChunk', () => {
        it('analyzes a clip and books its duration', async () => {
            model.reply(JSON.stringify(VALID_ANALYSIS));

            const result = await analyzer.analyzeLiveAudioChunk(
                'b64',
                'audio/wav',
                'Civic',
                'u1',
                's1',
                30,
                undefined,
                5,
            );

            expect((result as AIAnalysis).diagnosis).toBe('Worn serpentine belt');
            expect(model.requests[0].media).toEqual({ kind: 'audio', mimeType: 'audio/wav', data: 'b64' });
            expect(sessions.updateLastProcessedAudioChunkTimestamp).toHaveBeenCalledWith('s1', 5);
            expect(sessions.updateCumulativeAudioDuration).toHaveBeenCalledWith('s1', 0.5);
        });

        it('enforces the per-session audio quota', async () => {
            const max = SHARED_CONFIG.SUBSCRIPTION.PRO_USER_MAX_AUDIO_MINUTES;
            (sessions.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
                session({ cumulativeAudioDurationProcessedMinutes: max }),
            );
            await expect(analyzer.analyzeLiveAudioChunk('b64', 'audio/wav', 'Civic', 'u1', 's1', 30)).rejects.toThrow(
                `limit of ${max} minutes`,
            );
        });

        it('drops clips that arrive too soon', async () => {
            (sessions.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
                session({ lastProcessedAudioChunkTimestamp: 1000 }),
            );
            const result = await analyzer.analyzeLiveAudioChunk(
                'b64',
                'audio/wav',
                'Civic',
                'u1',
                's1',
                5,
                undefined,
                1001,
            );
            expect(result).toBeNull();
        });

        it('rejects free users', async () => {
            (users.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ tier: 'free' });
            await expect(analyzer.analyzeLiveAudioChunk('b64', 'audio/wav', 'Civic', 'u1', 's1', 5)).rejects.toThrow(
                'Free users do not have access to live audio analysis.',
            );
        });
    });
});
