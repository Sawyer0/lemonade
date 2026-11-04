import { describe, expect, it } from 'vitest';
import { isProOnlyApiPath, isProtectedApiPath } from '../routeAccess';

describe('routeAccess', () => {
    it.each(['/api/chat', '/api/chat/message', '/api/session/abc/summarize', '/api/vehicles/scan'])(
        'requires auth for %s',
        (path) => {
            expect(isProtectedApiPath(path)).toBe(true);
        },
    );

    it.each(['/api/memory', '/api/vector', '/api/search'])('requires auth for data and paid-API proxy %s', (path) => {
        expect(isProtectedApiPath(path)).toBe(true);
    });

    it.each(['/api/nhtsa/recalls', '/api/profile', '/api/token-count', '/'])('leaves %s to its own handler', (path) => {
        expect(isProtectedApiPath(path)).toBe(false);
    });

    it('does not treat look-alike prefixes as protected', () => {
        expect(isProtectedApiPath('/api/chatter')).toBe(false);
        expect(isProtectedApiPath('/api/searching')).toBe(false);
    });

    it('gates Pro-only routes', () => {
        expect(isProOnlyApiPath('/api/analysis/trigger')).toBe(true);
        expect(isProOnlyApiPath('/api/session/token')).toBe(true);
        expect(isProOnlyApiPath('/api/session/abc')).toBe(false);
        expect(isProOnlyApiPath('/api/chat')).toBe(false);
    });
});
