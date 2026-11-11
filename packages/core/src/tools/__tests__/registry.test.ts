import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../registry';
import { createLemonadeToolRegistry } from '../lemonadeTools';

describe('ToolRegistry', () => {
    const echoRegistry = () => {
        const registry = new ToolRegistry();
        registry.register({
            name: 'diag.echo',
            description: 'Echoes its input.',
            side: 'server',
            argsSchema: z.object({ text: z.string() }),
            handler: (args) => `echo: ${(args as { text: string }).text}`,
        });
        return registry;
    };

    it('calls a registered tool with validated arguments', async () => {
        const registry = echoRegistry();
        expect(await registry.call('diag.echo', { text: 'hi' })).toEqual({ ok: true, output: 'echo: hi' });
    });

    it('rejects a name outside namespace.name', () => {
        const registry = new ToolRegistry();
        expect(() =>
            registry.register({
                name: 'echo',
                description: 'Flat name.',
                side: 'server',
                argsSchema: z.object({}),
            }),
        ).toThrow('namespace.name');
    });

    it('rejects a duplicate registration', () => {
        const registry = echoRegistry();
        expect(() =>
            registry.register({
                name: 'diag.echo',
                description: 'Again.',
                side: 'server',
                argsSchema: z.object({}),
            }),
        ).toThrow('already registered');
    });

    it('reports an unknown tool as a failure, not a throw', async () => {
        const registry = echoRegistry();
        expect(await registry.call('diag.missing', {})).toEqual({ ok: false, error: 'unknown tool: diag.missing' });
    });

    it('reports invalid arguments as a failure without calling the handler', async () => {
        const registry = echoRegistry();
        const result = await registry.call('diag.echo', { text: 42 });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('invalid arguments for diag.echo');
        }
    });

    it('turns a throwing handler into a failure', async () => {
        const registry = new ToolRegistry();
        registry.register({
            name: 'diag.boom',
            description: 'Always throws.',
            side: 'server',
            argsSchema: z.object({}),
            handler: () => {
                throw new Error('kaboom');
            },
        });
        expect(await registry.call('diag.boom', {})).toEqual({ ok: false, error: 'kaboom' });
    });

    it('reports a tool with no handler instead of pretending to run it', async () => {
        const registry = createLemonadeToolRegistry();
        expect(await registry.call('chat.google_search', { query: 'x' })).toEqual({
            ok: false,
            error: 'tool chat.google_search has no handler in this registry',
        });
    });

    it('resolves legacy flat model names and reports their side', () => {
        const registry = createLemonadeToolRegistry();
        expect(registry.get('google_search')?.name).toBe('chat.google_search');
        expect(registry.sideOf('google_search')).toBe('server');
        // verify_safe_support is a client tool: the camera lives on the client.
        expect(registry.sideOf('verify_safe_support')).toBe('client');
        expect(registry.sideOf('display_content')).toBe('client');
        expect(registry.sideOf('no_such_tool')).toBeUndefined();
    });

    it('lists tools by namespace', () => {
        const registry = createLemonadeToolRegistry();
        expect(registry.listByNamespace('chat').map((tool) => tool.name)).toEqual([
            'chat.display_content',
            'chat.google_search',
            'chat.save_to_memory',
            'chat.start_video_stream',
            'chat.verify_safe_support',
        ]);
    });
});
