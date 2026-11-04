import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

const set = vi.fn(async () => {});
const constructEvent = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: () => ({ collection: () => ({ doc: () => ({ set }) }) }),
}));
vi.mock('../infrastructure/di/container', () => ({
    container: { get: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('../stripe', () => ({
    getStripe: () => ({ webhooks: { constructEvent } }),
    getProPriceId: vi.fn(),
}));

const completed = {
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'u1', subscription: 'sub_1', customer: 'cus_1' } },
};

function response() {
    const res = { statusCode: 200, body: undefined as unknown };
    const api = {
        status: vi.fn((code: number) => {
            res.statusCode = code;
            return api;
        }),
        send: vi.fn((body: unknown) => {
            res.body = body;
            return api;
        }),
        json: vi.fn((body: unknown) => {
            res.body = body;
            return api;
        }),
    };
    return { res, api: api as unknown as Response };
}

async function callWebhook(headers: Record<string, string>, body: unknown = completed) {
    const { stripeWebhook } = await import('../payments');
    const req = { headers, body, rawBody: Buffer.from(JSON.stringify(body)) } as unknown as Request;
    const { res, api } = response();
    await (stripeWebhook as unknown as (req: Request, res: Response) => Promise<void>)(req, api);
    return res;
}

describe('stripeWebhook', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        set.mockClear();
        constructEvent.mockReset();
    });

    it('rejects every request when the webhook secret is not configured', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
        const res = await callWebhook({ 'stripe-signature': 't=1,v1=abc' });
        expect(res.statusCode).toBe(500);
        expect(set).not.toHaveBeenCalled();
    });

    it('rejects unsigned requests', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
        const res = await callWebhook({});
        expect(res.statusCode).toBe(400);
        expect(constructEvent).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    it('rejects a bad signature', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
        constructEvent.mockImplementation(() => {
            throw new Error('No signatures found matching the expected signature');
        });
        const res = await callWebhook({ 'stripe-signature': 't=1,v1=bad' });
        expect(res.statusCode).toBe(400);
        expect(set).not.toHaveBeenCalled();
    });

    it('upgrades the user on a verified checkout.session.completed', async () => {
        vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
        constructEvent.mockReturnValue(completed);
        const res = await callWebhook({ 'stripe-signature': 't=1,v1=good' });
        expect(constructEvent).toHaveBeenCalledWith(expect.any(Buffer), 't=1,v1=good', 'whsec_test');
        expect(set).toHaveBeenCalledWith(
            expect.objectContaining({ tier: 'pro', subscriptionId: 'sub_1', stripeCustomerId: 'cus_1' }),
            { merge: true },
        );
        expect(res.body).toEqual({ received: true });
    });
});
