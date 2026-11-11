import { describe, it, expect, vi } from 'vitest';
import type { ILiveStreamAnalyzer, VisualBurstMessage } from '@lemonade/core';
import { BurstAnalyzer, type DiagnosticJobSubmission } from '../src/diagnosis/BurstAnalyzer';
import { detection, fakeResponder, session } from './fakes';

function burst(localDetections?: VisualBurstMessage['metadata']['localDetections']): VisualBurstMessage {
    return {
        frames: ['frame-b64'],
        component: 'brakes',
        metadata: { reason: 'r', sessionId: 's', timestamp: 7, localDetections },
    };
}

function setup(liveResult: Awaited<ReturnType<ILiveStreamAnalyzer['analyzeLiveImageFrame']>>) {
    const jobs: DiagnosticJobSubmission = {
        submitJob: vi.fn(async () => ({ jobId: 'job-1' })),
        trackJob: vi.fn(),
    };
    const live = {
        analyzeLiveImageFrame: vi.fn().mockResolvedValue(liveResult),
        analyzeLiveAudioChunk: vi.fn(),
    } as unknown as ILiveStreamAnalyzer;
    return { analyzer: new BurstAnalyzer(live), jobs, live, respond: fakeResponder() };
}

describe('BurstAnalyzer', () => {
    it('files complex systems as a job ticket and keeps talking, without waiting on the reasoner', async () => {
        const { analyzer, jobs, live, respond } = setup(null);
        await analyzer.analyze(burst([detection('Wheel speed sensor', 'ABS')]), session, respond, jobs);

        expect(jobs.submitJob).toHaveBeenCalledWith(
            expect.objectContaining({
                question: 'Analyze the brakes for issues.',
                evidenceRefs: ['Wheel speed sensor (ABS)'],
                sessionId: 'session-1',
                userId: 'user-1',
                vehicle: session.vehicle,
                localTriage: expect.objectContaining({ timestamp: 7 }),
            }),
        );
        expect(jobs.trackJob).toHaveBeenCalledWith('job-1');
        expect(respond.say).toHaveBeenCalledWith('Scanning the brakes system. One moment...');
        expect(live.analyzeLiveImageFrame).not.toHaveBeenCalled();
    });

    it('says the diagnostician is unreachable when the job cannot be filed', async () => {
        const { analyzer, jobs, respond } = setup(null);
        jobs.submitJob = vi.fn(async () => {
            throw new Error('service down');
        });
        await analyzer.analyze(burst([detection('Wheel speed sensor', 'ABS')]), session, respond, jobs);

        expect(respond.say).toHaveBeenCalledWith(
            expect.stringContaining(
                "The diagnostician is unreachable right now, so I can't check the brakes system yet.",
            ),
        );
        expect(jobs.trackJob).not.toHaveBeenCalled();
    });

    it('speaks a live-frame diagnosis for ordinary parts', async () => {
        const { analyzer, jobs, live, respond } = setup({ diagnosis: 'Pads are worn.' } as never);
        await analyzer.analyze(burst([detection('Brake pad', 'Braking')]), session, respond, jobs);

        expect(jobs.submitJob).not.toHaveBeenCalled();
        expect(live.analyzeLiveImageFrame).toHaveBeenCalledWith(
            'frame-b64',
            'image/jpeg',
            session.vehicleJson,
            'user-1',
            'session-1',
            session.vehicle.vin,
            7,
            expect.objectContaining({ timestamp: 7 }),
        );
        expect(respond.say).toHaveBeenCalledWith('Pads are worn.');
    });

    it('forwards tool calls from the live analyzer to the device', async () => {
        const { analyzer, jobs, respond } = setup([
            { type: 'text', text: 'hmm' },
            { type: 'tool-call', toolCallId: 't1', toolName: 'start_video_stream', args: { component: 'belt' } },
        ]);
        await analyzer.analyze(burst(), session, respond, jobs);

        expect(respond.requestTool).toHaveBeenCalledWith({
            id: 't1',
            name: 'start_video_stream',
            args: { component: 'belt' },
        });
        expect(respond.say).not.toHaveBeenCalled();
    });

    it('stays quiet when the analyzer has nothing to add', async () => {
        const { analyzer, jobs, respond } = setup(null);
        await analyzer.analyze(burst(), session, respond, jobs);
        expect(respond.say).not.toHaveBeenCalled();
    });
});
