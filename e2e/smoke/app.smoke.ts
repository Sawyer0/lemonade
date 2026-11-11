import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OFFLINE_CHAT_REPLY } from '@lemonade/infrastructure/src/ai/llm/offlineDemo';
import { FIXTURE_VEHICLE, FIXTURE_VIN } from './nhtsaFixtureServer';
import { SMOKE_PORT } from './globalSetup';

/**
 * Runs against the real production server started in globalSetup: middleware,
 * route handlers, DI container, Firestore and Auth emulators, the offline model
 * provider and recorded NHTSA responses. Nothing in the app is mocked.
 */
const BASE = `http://127.0.0.1:${SMOKE_PORT}`;
const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;

interface TestUser {
    uid: string;
    idToken: string;
}

/** Creates a user in the Auth emulator and returns its ID token, as the web client would. */
async function signUp(): Promise<TestUser> {
    const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            email: `smoke-${randomUUID()}@example.com`,
            password: 'smoke-password',
            returnSecureToken: true,
        }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { localId: string; idToken: string };
    return { uid: body.localId, idToken: body.idToken };
}

function api(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.token) headers.set('authorization', `Bearer ${init.token}`);
    if (init.body) headers.set('content-type', 'application/json');
    return fetch(`${BASE}${path}`, { ...init, headers });
}

describe('pages', () => {
    it.each(['/', '/garage', `/session/${randomUUID()}`])('renders %s', async (path) => {
        const res = await fetch(`${BASE}${path}`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('<title>Master Tech</title>');
    });
});

describe('auth-guarded API routes', () => {
    it.each([
        ['GET', '/api/vehicles?userId=someone'],
        ['GET', '/api/session'],
        ['POST', '/api/chat'],
        ['POST', '/api/vehicles/scan'],
        // LM-05: closing a case and reading it are auth-guarded; the auth
        // check runs before any case-ledger access, so no Postgres is needed
        // for these assertions.
        ['GET', '/api/cases/123e4567-e89b-12d3-a456-426614174000'],
        ['POST', '/api/cases/123e4567-e89b-12d3-a456-426614174000/close'],
    ])('%s %s answers 401 without a token', async (method, path) => {
        const res = await api(path, { method });
        expect(res.status).toBe(401);
    });

    it('answers 401 for a forged token', async () => {
        const forged = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
            JSON.stringify({ iss: 'https://securetoken.google.com/other', aud: 'other', sub: 'x', exp: 9e9 }),
        ).toString('base64url')}.`;
        expect((await api('/api/session', { token: forged })).status).toBe(401);
    });

    it('ignores spoofed identity headers without a valid token', async () => {
        const res = await api('/api/session', { headers: { 'x-user-id': 'victim', 'x-security-seal': 'abc' } });
        expect(res.status).toBe(401);
    });
});

describe('signed-in flow', () => {
    let user: TestUser;
    let vehicleId: string;
    let sessionId: string;

    beforeAll(async () => {
        user = await signUp();
    });

    it('starts with an empty garage', async () => {
        const res = await api(`/api/vehicles?userId=${user.uid}`, { token: user.idToken });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: [] });
    });

    it("refuses another user's garage", async () => {
        const res = await api('/api/vehicles?userId=someone-else', { token: user.idToken });
        expect(res.status).toBe(403);
    });

    it('onboards a vehicle by VIN (decoded from recorded vPIC data) and stores it', async () => {
        const scan = await api('/api/vehicles/scan', {
            method: 'POST',
            token: user.idToken,
            body: JSON.stringify({ vin: FIXTURE_VIN, userId: user.uid }),
        });
        expect(scan.status).toBe(200);
        const scanned = (await scan.json()) as { data: { id: string; specs: Record<string, unknown> } };
        expect(scanned.data.specs).toMatchObject({ ...FIXTURE_VEHICLE, engine: '3.0L V-Shaped Gasoline' });
        vehicleId = scanned.data.id;

        const list = await api(`/api/vehicles?userId=${user.uid}`, { token: user.idToken });
        const garage = (await list.json()) as { data: Array<{ id: string; vin: string }> };
        expect(garage.data).toEqual([expect.objectContaining({ id: vehicleId, vin: FIXTURE_VIN })]);
    });

    it('returns the recorded NHTSA recalls for that vehicle', async () => {
        const { year, make, model } = FIXTURE_VEHICLE;
        const res = await api(`/api/nhtsa/recalls?year=${year}&make=${make}&model=${model}`);
        expect(res.status).toBe(200);
        const { recalls } = (await res.json()) as { recalls: Array<{ Component: string }> };
        expect(recalls).toHaveLength(24);
        expect(recalls[0].Component).toContain('AIR BAGS');
    });

    it('starts a diagnostic session', async () => {
        const res = await api('/api/session', {
            method: 'POST',
            token: user.idToken,
            body: JSON.stringify({ vehicleId, complaint: 'Brakes squeal in the morning' }),
        });
        expect(res.status).toBe(200);
        sessionId = ((await res.json()) as { sessionId: string }).sessionId;

        const list = await api('/api/session', { token: user.idToken });
        const sessions = (await list.json()) as { data: Array<{ id: string; vehicleId: string }> };
        expect(sessions.data).toEqual([expect.objectContaining({ id: sessionId, vehicleId })]);
    });

    it('streams a chat reply from the offline model', async () => {
        const res = await api('/api/chat', {
            method: 'POST',
            token: user.idToken,
            headers: { 'x-session-id': sessionId },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'My brakes squeal for the first few stops every morning.' }],
                vehicleContext: { ...FIXTURE_VEHICLE, vin: FIXTURE_VIN },
            }),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/x-ndjson');

        const events = (await res.text())
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as { type: string; content?: string });
        const text = events
            .filter((e) => e.type === 'text')
            .map((e) => e.content)
            .join('');
        expect(text).toContain(OFFLINE_CHAT_REPLY);
        expect(events.at(-1)?.type).toBe('done');
    });

    it('blocks a dangerous request before any model is called', async () => {
        const res = await api('/api/chat', {
            method: 'POST',
            token: user.idToken,
            headers: { 'x-session-id': sessionId },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Gas is leaking under the car, can I keep driving?' }],
                vehicleContext: { ...FIXTURE_VEHICLE, vin: FIXTURE_VIN },
            }),
        });
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).not.toContain(OFFLINE_CHAT_REPLY);
    });
});
