import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../config', () => ({ CONFIG: { GCLOUD: { PROJECT_ID: 'demo-lemonade' } } }));

const { EdgeSecurityService, isAuthEmulatorEnabled } = await import('../EdgeSecurityService');

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function emulatorToken(claims: Record<string, unknown> = {}, alg = 'none'): string {
    const now = Math.floor(Date.now() / 1000);
    return `${encode({ alg, typ: 'JWT' })}.${encode({
        iss: 'https://securetoken.google.com/demo-lemonade',
        aud: 'demo-lemonade',
        sub: 'user-1',
        iat: now,
        exp: now + 3600,
        ...claims,
    })}.`;
}

describe('Auth emulator tokens', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('are only enabled with the emulator host and a demo- project', () => {
        expect(isAuthEmulatorEnabled({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, 'demo-lemonade')).toBe(true);
        expect(isAuthEmulatorEnabled({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, 'lemonade-prod')).toBe(false);
        expect(isAuthEmulatorEnabled({}, 'demo-lemonade')).toBe(false);
    });

    it('accepts a valid emulator token when the emulator is configured', async () => {
        vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
        const payload = await new EdgeSecurityService().verifyToken(emulatorToken({ stripe_role: 'pro' }));
        expect(payload).toMatchObject({ sub: 'user-1', stripe_role: 'pro' });
    });

    it('rejects emulator tokens for another project, expired, signed or without a subject', async () => {
        vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
        const service = new EdgeSecurityService();
        expect(await service.verifyToken(emulatorToken({ aud: 'other' }))).toBeNull();
        expect(await service.verifyToken(emulatorToken({ iss: 'https://evil.example' }))).toBeNull();
        expect(await service.verifyToken(emulatorToken({ exp: 1 }))).toBeNull();
        expect(await service.verifyToken(emulatorToken({ sub: '' }))).toBeNull();
        expect(await service.verifyToken(emulatorToken({}, 'RS256'))).toBeNull();
        expect(await service.verifyToken('not-a-jwt')).toBeNull();
    });
});
