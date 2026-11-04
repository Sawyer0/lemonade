import { describe, it, expect } from 'vitest';
import { decodeJwt } from 'jose';
import { loadEnv } from '../src/env';
import { describeVehicle, parseSessionContext } from '../src/diagnosis/sessionContext';
import { issueRoomToken } from '../src/tokens';

describe('loadEnv', () => {
    it('uses livekit dev defaults outside production', () => {
        expect(loadEnv({})).toMatchObject({
            LIVEKIT_URL: 'ws://localhost:7880',
            LIVEKIT_API_KEY: 'devkey',
            PORT: 3001,
        });
    });

    it('refuses to start in production without livekit credentials', () => {
        expect(() => loadEnv({ NODE_ENV: 'production', LIVEKIT_URL: 'wss://x' })).toThrow('LIVEKIT_API_KEY');
    });

    it('accepts GEMINI_API_KEY as the google key', () => {
        expect(loadEnv({ GEMINI_API_KEY: 'g' }).GOOGLE_API_KEY).toBe('g');
    });
});

describe('parseSessionContext', () => {
    it('reads the vehicle and user from client metadata', () => {
        const metadata = JSON.stringify({
            userId: 'uid-7',
            vehicleContext: JSON.stringify({ year: '2018', make: 'Ford', model: 'F-150', vin: 'VIN' }),
        });
        const context = parseSessionContext('room-1', 'identity', metadata);
        expect(context).toMatchObject({ sessionId: 'room-1', userId: 'uid-7', vehicle: { year: 2018, make: 'Ford' } });
        expect(describeVehicle(context.vehicle)).toBe('2018 Ford F-150');
    });

    it('falls back to the participant identity and an unknown vehicle', () => {
        const context = parseSessionContext('room-1', 'identity', 'not json');
        expect(context.userId).toBe('identity');
        expect(describeVehicle(context.vehicle)).toBe('unknown vehicle');
    });
});

describe('issueRoomToken', () => {
    const credentials = { apiKey: 'key', apiSecret: 'a-secret-that-is-long-enough-for-hs256' };
    const verify = async (token: string) => {
        if (token !== 'good') throw new Error('bad token');
        return 'uid-1';
    };

    it('issues a token whose identity is the verified uid', async () => {
        const result = await issueRoomToken(
            { authorization: 'Bearer good', roomName: 'room-9', metadata: '{}' },
            verify,
            credentials,
        );
        expect(result.status).toBe(200);
        const claims = decodeJwt((result.body as { token: string }).token);
        expect(claims.sub).toBe('uid-1');
        expect(claims).toMatchObject({ video: { roomJoin: true, room: 'room-9', canPublishData: true } });
    });

    it('rejects missing or invalid credentials and missing rooms', async () => {
        expect((await issueRoomToken({ roomName: 'r' }, verify, credentials)).status).toBe(401);
        expect((await issueRoomToken({ authorization: 'Bearer bad', roomName: 'r' }, verify, credentials)).status).toBe(
            401,
        );
        expect((await issueRoomToken({ authorization: 'Bearer good' }, verify, credentials)).status).toBe(400);
    });
});
