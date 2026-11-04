import { describe, it, expect, vi } from 'vitest';
import type { ILiveStreamAnalyzer, VisualBurstMessage } from '@lemonade/core';
import { BurstAnalyzer } from '../src/diagnosis/BurstAnalyzer';
import { detection, diagnosis, fakeResponder, session } from './fakes';

function burst(localDetections?: VisualBurstMessage['metadata']['localDetections']): VisualBurstMessage {
    return {
        frames: ['frame-b64'],
        component: 'brakes',
        metadata: { reason: 'r', sessionId: 's', timestamp: 7, localDetections },
    };
}

function setup(liveResult: Awaited<ReturnType<ILiveStreamAnalyzer['analyzeLiveImageFrame']>>) {
    const reasoning = { diagnose: vi.fn().mockResolvedValue(diagnosis('Replace the ABS sensor.')) };
    const live = {
        analyzeLiveImageFrame: vi.fn().mockResolvedValue(liveResult),
        analyzeLiveAudioChunk: vi.fn(),
    } as unknown as ILiveStreamAnalyzer;
    return { analyzer: new BurstAnalyzer(reasoning, live), reasoning, live, respond: fakeResponder() };
}

describe('BurstAnalyzer', () => {
    it('sends complex systems through full reasoning and speaks the result', async () => {
        const { analyzer, reasoning, live, respond } = setup(null);
        await analyzer.analyze(burst([detection('Wheel speed sensor', 'ABS')]), session, respond);

        expect(reasoning.diagnose).toHaveBeenCalledWith(
            expect.objectContaining({ sessionId: 'session-1', userId: 'user-1', vehicleContext: session.vehicle }),
        );
        expect(respond.say).toHaveBeenLastCalledWith('Replace the ABS sensor.');
        expect(live.analyzeLiveImageFrame).not.toHaveBeenCalled();
    });

    it('speaks a live-frame diagnosis for ordinary parts', async () => {
        const { analyzer, reasoning, live, respond } = setup({ diagnosis: 'Pads are worn.' } as never);
        await analyzer.analyze(burst([detection('Brake pad', 'Braking')]), session, respond);

        expect(reasoning.diagnose).not.toHaveBeenCalled();
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
        const { analyzer, respond } = setup([
            { type: 'text', text: 'hmm' },
            { type: 'tool-call', toolCallId: 't1', toolName: 'start_video_stream', args: { component: 'belt' } },
        ]);
        await analyzer.analyze(burst(), session, respond);

        expect(respond.requestTool).toHaveBeenCalledWith({
            id: 't1',
            name: 'start_video_stream',
            args: { component: 'belt' },
        });
        expect(respond.say).not.toHaveBeenCalled();
    });

    it('stays quiet when the analyzer has nothing to add', async () => {
        const { analyzer, respond } = setup(null);
        await analyzer.analyze(burst(), session, respond);
        expect(respond.say).not.toHaveBeenCalled();
    });
});
