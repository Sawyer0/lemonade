import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    AIAnalysis,
    ILogger,
    IMultimodalUploadAnalyzer,
    INHTSAService,
    ISafetyMonitor,
    ISessionRepository,
    IVectorRepository,
    IVehicleRepository,
} from '@lemonade/core';
import { VideoAnalysisService } from '../application/services/VideoAnalysisService';

const analysis = (): AIAnalysis =>
    ({
        diagnosis: 'Worn brake pads',
        suggested_actions: ['Replace pads'],
        safety_alert: false,
    }) as unknown as AIAnalysis;

function setup() {
    const sessions = {
        updateStatus: vi.fn(async () => {}),
        findById: vi.fn(async () => ({ id: 's1', userId: 'u1', vehicleId: 'v1' })),
        flagSafetyStop: vi.fn(async () => {}),
        updateVideo: vi.fn(async () => {}),
        updateAnalysis: vi.fn(async () => {}),
    };
    const vehicles = {
        findById: vi.fn(async () => ({ specs: { year: 2018, make: 'Honda', model: 'Civic', engine: '2.0L' } })),
    };
    const videoAI = { analyzeUploadedVideo: vi.fn(async (..._args: unknown[]) => analysis()) };
    const nhtsa = { checkRecalls: vi.fn(async () => [{ Component: 'BRAKES', Summary: 'Master cylinder leak' }]) };
    const vectors = { search: vi.fn(async () => [{ text: 'Torque 80 ft-lb', metadata: { source: 'TSB-1' } }]) };
    const safety = {
        assess: vi.fn(async () => ({
            intervention_required: false,
            hazards_detected: [] as string[],
            safety_score: 0,
        })),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const service = new VideoAnalysisService(
        sessions as unknown as ISessionRepository,
        vehicles as unknown as IVehicleRepository,
        videoAI as unknown as IMultimodalUploadAnalyzer,
        nhtsa as unknown as INHTSAService,
        vectors as unknown as IVectorRepository,
        safety as unknown as ISafetyMonitor,
        logger as unknown as ILogger,
    );
    return { service, sessions, videoAI, nhtsa, vectors, safety, logger };
}

const event = { filePath: 'sessions/s1/clip.mp4', contentType: 'video/mp4', bucket: 'demo-bucket' };

describe('VideoAnalysisService', () => {
    let ctx: ReturnType<typeof setup>;
    beforeEach(() => {
        ctx = setup();
    });

    it('ignores uploads outside sessions/<id>/', async () => {
        await ctx.service.processEvent({ ...event, filePath: 'avatars/u1.png' });
        expect(ctx.sessions.updateStatus).not.toHaveBeenCalled();
        expect(ctx.logger.error).toHaveBeenCalled();
    });

    it('analyzes the upload with recall and manual context, then saves it', async () => {
        await ctx.service.processEvent(event);

        expect(ctx.sessions.updateStatus).toHaveBeenCalledWith('s1', 'analyzing');
        expect(ctx.nhtsa.checkRecalls).toHaveBeenCalledWith(2018, 'Honda', 'Civic');
        const [uri, context, mime, userId, sessionId] = ctx.videoAI.analyzeUploadedVideo.mock.calls[0] as unknown[];
        expect(uri).toBe('gs://demo-bucket/sessions/s1/clip.mp4');
        expect(context).toContain('2018 Honda Civic 2.0L');
        expect(context).toContain('Master cylinder leak');
        expect(context).toContain('[Source: TSB-1]');
        expect([mime, userId, sessionId]).toEqual(['video/mp4', 'u1', 's1']);
        expect(ctx.sessions.updateVideo).toHaveBeenCalledWith('s1', uri);
        expect(ctx.sessions.updateAnalysis).toHaveBeenCalledWith(
            's1',
            expect.objectContaining({ safety_alert: false }),
        );
        expect(ctx.sessions.flagSafetyStop).not.toHaveBeenCalled();
    });

    it('keeps going when recall and memory lookups fail', async () => {
        ctx.nhtsa.checkRecalls.mockRejectedValueOnce(new Error('vpic down'));
        ctx.vectors.search.mockRejectedValueOnce(new Error('index down'));

        await ctx.service.processEvent(event);

        const context = ctx.videoAI.analyzeUploadedVideo.mock.calls[0][1] as unknown as string;
        expect(context).toContain('NHTSA Recall Database Unavailable');
        expect(ctx.sessions.updateAnalysis).toHaveBeenCalled();
    });

    it('flags a safety stop when the monitor intervenes', async () => {
        ctx.safety.assess.mockResolvedValueOnce({
            intervention_required: true,
            hazards_detected: ['BRAKE_FAILURE'],
            safety_score: 9,
        });

        await ctx.service.processEvent(event);

        expect(ctx.sessions.flagSafetyStop).toHaveBeenCalledWith('s1', 'BRAKE_FAILURE');
        expect(ctx.sessions.updateAnalysis).toHaveBeenCalledWith(
            's1',
            expect.objectContaining({
                safety_alert: true,
                diagnosis: expect.stringMatching(/^SAFETY STOP: BRAKE_FAILURE/),
            }),
        );
    });

    it('returns the session to active when analysis fails', async () => {
        ctx.videoAI.analyzeUploadedVideo.mockRejectedValueOnce(new Error('model unavailable'));

        await ctx.service.processEvent(event);

        expect(ctx.sessions.updateStatus).toHaveBeenLastCalledWith('s1', 'active');
        expect(ctx.sessions.updateAnalysis).not.toHaveBeenCalled();
    });

    it('returns the session to active when it does not exist', async () => {
        ctx.sessions.findById.mockResolvedValueOnce(null as never);

        await ctx.service.processEvent(event);

        expect(ctx.videoAI.analyzeUploadedVideo).not.toHaveBeenCalled();
        expect(ctx.sessions.updateStatus).toHaveBeenLastCalledWith('s1', 'active');
    });
});
