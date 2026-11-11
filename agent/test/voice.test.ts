import { describe, it, expect, vi } from 'vitest';
import { LiveChannelTopic } from '@lemonade/core';
import { RoomPublisher } from '../src/channel/roomPublisher';

describe('RoomPublisher', () => {
    it('publishes typed packets on their topics', async () => {
        const publishData = vi.fn().mockResolvedValue(undefined);
        const publisher = new RoomPublisher(() => ({ publishData }));

        await publisher.transcript('Check the belt.');
        await publisher.requestVisualBurst('belt', 'looks glazed');

        const [transcript, transcriptOptions] = publishData.mock.calls[0];
        expect(JSON.parse(new TextDecoder().decode(transcript))).toEqual({
            type: 'chat',
            analysis: { diagnosis: 'Check the belt.' },
        });
        expect(transcriptOptions).toEqual({ reliable: true, topic: LiveChannelTopic.AiResponse });
        expect(publishData.mock.calls[1][1].topic).toBe(LiveChannelTopic.VisualBurstRequest);
    });

    it('does nothing before the agent has joined', async () => {
        await expect(new RoomPublisher(() => undefined).transcript('x')).resolves.toBeUndefined();
    });
});
