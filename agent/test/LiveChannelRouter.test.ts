import { describe, it, expect, vi } from 'vitest';
import { LiveChannelTopic, encodeLiveMessage } from '@lemonade/core';
import { LiveChannelRouter } from '../src/channel/LiveChannelRouter';
import { detection, fakeLogger, session } from './fakes';

function setup() {
    const conversation = { say: vi.fn().mockResolvedValue(undefined), replyTo: vi.fn(), inform: vi.fn() };
    const logger = fakeLogger();
    const router = new LiveChannelRouter(session, conversation, logger);
    return { router, conversation, logger };
}

describe('LiveChannelRouter', () => {
    it('answers typed user messages through the model', async () => {
        const { router, conversation } = setup();
        const payload = encodeLiveMessage({ text: 'it squeals when cold', sessionId: 's', timestamp: 1 });
        await router.handle(payload, 'user-1', LiveChannelTopic.UserMessage);
        expect(conversation.replyTo).toHaveBeenCalledWith('it squeals when cold');
    });

    it('ignores packets from anyone but the session user', async () => {
        const { router, conversation } = setup();
        const payload = encodeLiveMessage({ text: 'hi', sessionId: 's', timestamp: 1 });
        await router.handle(payload, 'someone-else', LiveChannelTopic.UserMessage);
        expect(conversation.replyTo).not.toHaveBeenCalled();
    });

    it('speaks up only for risky proactive pings', async () => {
        const { router, conversation } = setup();
        const ping = (risk: boolean) =>
            encodeLiveMessage({
                type: 'PROACTIVE_PING',
                detection: detection('Brake Rotor', 'Braking', risk),
                sessionId: 's',
                timestamp: 1,
            });

        await router.handle(ping(false), 'user-1', LiveChannelTopic.ProactivePing);
        expect(conversation.say).not.toHaveBeenCalled();

        await router.handle(ping(true), 'user-1', LiveChannelTopic.ProactivePing);
        expect(conversation.say).toHaveBeenCalledWith(expect.stringContaining('Brake Rotor'));
    });

    it('ignores frame packets: frames arrive as byte streams, not data packets', async () => {
        const { router, conversation } = setup();
        const burst = { frames: ['f'], metadata: { reason: 'r', sessionId: 's', timestamp: 1 } };
        await router.handle(encodeLiveMessage(burst), 'user-1', LiveChannelTopic.VisualFrameStream);
        expect(conversation.replyTo).not.toHaveBeenCalled();
        expect(conversation.say).not.toHaveBeenCalled();
    });

    it('tells the model about device tool results', async () => {
        const { router, conversation } = setup();
        const payload = encodeLiveMessage({ toolCallId: 't1', response: { result: 'Camera Opened' } });
        await router.handle(payload, 'user-1', LiveChannelTopic.ToolResponse);
        expect(conversation.inform).toHaveBeenCalledWith(expect.stringContaining('Camera Opened'));
    });

    it('drops malformed packets with a warning and logs handler failures', async () => {
        const { router, conversation, logger } = setup();
        await router.handle(new TextEncoder().encode('{bad'), 'user-1', LiveChannelTopic.UserMessage);
        expect(logger.warn).toHaveBeenCalled();

        conversation.say.mockRejectedValueOnce(new Error('session down'));
        const ping = encodeLiveMessage({
            type: 'PROACTIVE_PING',
            detection: detection('Brake Rotor', 'Braking', true),
            sessionId: 's',
            timestamp: 1,
        });
        await router.handle(ping, 'user-1', LiveChannelTopic.ProactivePing);
        expect(logger.error).toHaveBeenCalled();
    });
});
