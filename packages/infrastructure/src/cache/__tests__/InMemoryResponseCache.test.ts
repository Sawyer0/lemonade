import { describe, it, expect } from 'vitest';
import { InMemoryResponseCache } from '../InMemoryResponseCache';

describe('InMemoryResponseCache', () => {
    it('returns a copy of a stored value until it expires', async () => {
        let now = 0;
        const cache = new InMemoryResponseCache(10, () => now);
        const value = { text: 'hi', parts: [1] };
        await cache.set('k', value, 60);

        const hit = await cache.get<typeof value>('k');
        expect(hit).toEqual(value);
        expect(hit).not.toBe(value);
        expect(await cache.get('other')).toBeUndefined();

        now = 60_000;
        expect(await cache.get('k')).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it('evicts the oldest entry once full and refreshes rewritten keys', async () => {
        const cache = new InMemoryResponseCache(2);
        await cache.set('a', 1, 60);
        await cache.set('b', 2, 60);
        await cache.set('a', 3, 60);
        await cache.set('c', 4, 60);
        expect(await cache.get('b')).toBeUndefined();
        expect(await cache.get('a')).toBe(3);
        expect(await cache.get('c')).toBe(4);
    });
});
