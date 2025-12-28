import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';

// Mock adminDb
vi.mock('@lemonade/infrastructure', async () => {
    const actual = await vi.importActual('@lemonade/infrastructure');
    return {
        ...actual,
        adminDb: {
            collection: vi.fn()
        }
    };
});

// Mock Stripe
vi.mock('stripe', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            billingPortal: {
                sessions: {
                    create: vi.fn().mockResolvedValue({
                        url: 'https://billing.stripe.com/session/test'
                    })
                }
            }
        }))
    };
});

import { adminDb } from '@lemonade/infrastructure';

// Mocks
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
};

// Mock Firestore document
const mockDocGet = vi.fn();
const mockDoc = vi.fn(() => ({
    get: mockDocGet
}));
const mockCollection = vi.fn(() => ({
    doc: mockDoc
}));

// Helper to create request
function createRequest(headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/stripe/portal', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    });
}

describe('POST /api/stripe/portal', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        // Setup adminDb mock
        (adminDb.collection as ReturnType<typeof vi.fn>).mockImplementation(mockCollection);
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                id: 'user-123',
                stripeCustomerId: 'cus_test123'
            })
        });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('Authentication', () => {
        it('returns 401 when x-user-id header missing', async () => {
            const req = createRequest();
            const res = await POST(req);

            expect(res.status).toBe(401);
        });
    });

    describe('Success Cases', () => {
        it.skip('returns portal URL for user with stripeCustomerId', async () => {
            // Skipped: requires STRIPE_SECRET_KEY env var and Stripe mock setup
            const req = createRequest({ 'x-user-id': 'user-123' });
            const res = await POST(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.url).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        it('returns 404 when user not found', async () => {
            mockDocGet.mockResolvedValue({
                exists: false,
                data: () => null
            });

            const req = createRequest({ 'x-user-id': 'user-123' });
            const res = await POST(req);

            expect(res.status).toBe(404);
        });

        it('returns 404 when user has no stripeCustomerId', async () => {
            mockDocGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    id: 'user-123'
                    // no stripeCustomerId
                })
            });

            const req = createRequest({ 'x-user-id': 'user-123' });
            const res = await POST(req);

            expect(res.status).toBe(404);
        });

        it('returns 500 when Firestore fails', async () => {
            mockDocGet.mockRejectedValue(new Error('Firestore error'));

            const req = createRequest({ 'x-user-id': 'user-123' });
            const res = await POST(req);

            expect(res.status).toBe(500);
        });
    });
});
