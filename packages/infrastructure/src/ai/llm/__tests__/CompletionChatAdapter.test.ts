import { describe, expect, it } from 'vitest';
import type { StreamingEvent } from '@lemonade/core';
import { CompletionChatAdapter, estimateTokens, parseJsonObject } from '../CompletionChatAdapter';
import { CompletionSafetyAdapter } from '../CompletionSafetyAdapter';
import { FakeChatCompletionClient } from '../FakeChatCompletionClient';

describe('CompletionChatAdapter', () => {
    it('sends the mechanic system prompt, vehicle context and history in order', async () => {
        const client = new FakeChatCompletionClient(['Check the brake pads first.']);
        const adapter = new CompletionChatAdapter(client);

        const reply = await adapter.generateReply(
            [
                { role: 'user', content: 'Hi' },
                { role: 'assistant', content: [{ type: 'text', text: 'Hello, what is wrong?' }] },
            ],
            'My brakes squeak',
            'VEHICLE: 2018 Honda Civic',
            null,
        );

        expect(reply).toBe('Check the brake pads first.');
        const { messages } = client.requests[0];
        expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
        expect(messages[0].content).toContain('VEHICLE: 2018 Honda Civic');
        expect(messages[0].content).toContain('Current Diagnosis: None');
        expect(messages[2].content).toBe('Hello, what is wrong?');
        expect(messages[3].content).toBe('My brakes squeak');
    });

    it('streams text events and finishes with done', async () => {
        const adapter = new CompletionChatAdapter(new FakeChatCompletionClient(['Pads are worn.']));
        const events: StreamingEvent[] = [];
        for await (const event of adapter.generateReplyStream([], 'noise', 'VEHICLE: test', null)) events.push(event);

        expect(events.at(-1)).toEqual({ type: 'done' });
        const text = events.flatMap((e) => (e.type === 'text' ? [e.content] : [])).join('');
        expect(text).toBe('Pads are worn.');
    });

    it('parses a fenced JSON verification reply in JSON mode', async () => {
        const client = new FakeChatCompletionClient([
            '```json\n{"isVerified": true, "source": "https://example.com/tsb", "reasoning": "TSB matches."}\n```',
        ]);
        const result = await new CompletionChatAdapter(client).verifyHypothesis({
            hypothesis: 'Worn pads',
            evidence: 'TSB 19-001',
        });

        expect(result).toEqual({ isVerified: true, source: 'https://example.com/tsb', reasoning: 'TSB matches.' });
        expect(client.requests[0].jsonMode).toBe(true);
    });

    it('treats an unparseable verification reply as not verified', async () => {
        const result = await new CompletionChatAdapter(new FakeChatCompletionClient(['not json'])).verifyHypothesis({
            hypothesis: 'h',
            evidence: 'e',
        });
        expect(result.isVerified).toBe(false);
        expect(result.source).toBeNull();
    });

    it('estimates tokens at about four characters each', async () => {
        expect(estimateTokens('')).toBe(0);
        expect(estimateTokens('abcdefgh')).toBe(2);
        expect(await new CompletionChatAdapter(new FakeChatCompletionClient([])).countTokens('abcde')).toBe(2);
    });

    it('returns undefined for invalid JSON', () => {
        expect(parseJsonObject('{bad')).toBeUndefined();
    });
});

describe('CompletionSafetyAdapter', () => {
    it('returns the raw JSON text and requests JSON mode', async () => {
        const client = new FakeChatCompletionClient(['  {"intervention_required": false}  ']);
        const text = await new CompletionSafetyAdapter(client).assessSafety('Assess this. Respond in JSON.');
        expect(text).toBe('{"intervention_required": false}');
        expect(client.requests[0].jsonMode).toBe(true);
    });

    it('returns null for an empty reply so the monitor fails safe', async () => {
        expect(await new CompletionSafetyAdapter(new FakeChatCompletionClient([''])).assessSafety('x')).toBeNull();
    });
});
