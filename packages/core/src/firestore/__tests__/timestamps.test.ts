import { describe, it, expect } from 'vitest';
import { convertTimestamps } from '../timestamps';

const at = new Date('2026-03-04T05:06:07Z');
const timestamp = { seconds: 1, nanoseconds: 0, toDate: () => at };

describe('convertTimestamps', () => {
    it('turns nested timestamps into dates', () => {
        expect(convertTimestamps({ a: timestamp, list: [{ b: timestamp }], n: 1, s: 'x', none: null })).toEqual({
            a: at,
            list: [{ b: at }],
            n: 1,
            s: 'x',
            none: null,
        });
    });

    it('leaves dates and primitives alone', () => {
        expect(convertTimestamps(at)).toBe(at);
        expect(convertTimestamps({ when: at }).when).toBe(at);
        expect(convertTimestamps(undefined)).toBeUndefined();
        expect(convertTimestamps(3)).toBe(3);
    });
});
