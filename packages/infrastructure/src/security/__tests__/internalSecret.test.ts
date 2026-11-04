import { describe, it, expect } from 'vitest';
import { DEV_ONLY_INTERNAL_SECRET, InternalSecretError, resolveInternalSecret } from '../internalSecret';

const STRONG = 'a'.repeat(64);

describe('resolveInternalSecret', () => {
    it('uses the configured secret', () => {
        expect(resolveInternalSecret({ NODE_ENV: 'production', SECURITY_INTERNAL_SECRET: STRONG })).toBe(STRONG);
        expect(resolveInternalSecret({ NODE_ENV: 'development', SECURITY_INTERNAL_SECRET: 'short' })).toBe('short');
    });

    it('falls back to the dev-only key outside production', () => {
        expect(resolveInternalSecret({ NODE_ENV: 'development' })).toBe(DEV_ONLY_INTERNAL_SECRET);
        expect(resolveInternalSecret({ NODE_ENV: 'test', SECURITY_INTERNAL_SECRET: '  ' })).toBe(
            DEV_ONLY_INTERNAL_SECRET,
        );
        expect(resolveInternalSecret({})).toBe(DEV_ONLY_INTERNAL_SECRET);
    });

    it('refuses to run production without a secret', () => {
        expect(() => resolveInternalSecret({ NODE_ENV: 'production' })).toThrow(InternalSecretError);
        expect(() => resolveInternalSecret({ NODE_ENV: 'production', SECURITY_INTERNAL_SECRET: '' })).toThrow(
            'SECURITY_INTERNAL_SECRET is not set',
        );
    });

    it('refuses weak or dev secrets in production', () => {
        expect(() => resolveInternalSecret({ NODE_ENV: 'production', SECURITY_INTERNAL_SECRET: 'short' })).toThrow(
            'at least 32 characters',
        );
        expect(() =>
            resolveInternalSecret({ NODE_ENV: 'production', SECURITY_INTERNAL_SECRET: DEV_ONLY_INTERNAL_SECRET }),
        ).toThrow(InternalSecretError);
    });
});
