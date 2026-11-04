import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { GET, PATCH } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { User } from '@lemonade/core';
import { NextRequest } from 'next/server';

// Mock adminAuth and adminDb
vi.mock('@lemonade/infrastructure', async () => {
    const actual = await vi.importActual('@lemonade/infrastructure');
    return {
        ...actual,
        adminAuth: {
            verifyIdToken: vi.fn(),
        },
        adminDb: {
            collection: vi.fn(),
        },
    };
});

import { adminAuth, adminDb } from '@lemonade/infrastructure';

// Mocks
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

// Helper to create request
function createRequest(method: string, token?: string, body?: object) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const options: RequestInit = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    return new Request('http://localhost/api/profile', options);
}

// Sample user data
const sampleUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    tier: 'free',
    preferences: { autoOpenCamera: false },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
};

// Mock Firestore document
const mockDocGet = vi.fn();
const mockDocSet = vi.fn();
const mockDoc = vi.fn(() => ({
    get: mockDocGet,
    set: mockDocSet,
}));
const mockCollection = vi.fn(() => ({
    doc: mockDoc,
}));

describe('Profile API Route', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        // Setup adminAuth mock
        (adminAuth.verifyIdToken as Mock).mockResolvedValue({
            uid: 'user-123',
            email: 'test@example.com',
        });

        // Setup adminDb mock
        (adminDb.collection as Mock).mockImplementation(mockCollection);
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => sampleUser,
        });
        mockDocSet.mockResolvedValue(undefined);
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('GET /api/profile', () => {
        describe('Authentication', () => {
            it('returns 401 when Authorization header missing', async () => {
                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(401);
                const body = await res.json();
                expect(body.error).toContain('Missing token');
            });

            it('returns 401 when Bearer prefix missing', async () => {
                const req = new Request('http://localhost/api/profile', {
                    method: 'GET',
                    headers: { Authorization: 'token-without-bearer' },
                });
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(401);
            });

            it('returns 500 when token is invalid', async () => {
                (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid token'));

                const req = createRequest('GET', 'invalid-token');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(500);
            });
        });

        describe('Success Cases', () => {
            it('returns existing user profile', async () => {
                const req = createRequest('GET', 'valid-token');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data).toBeDefined();
                expect(body.data.id).toBe('user-123');
                expect(body.data.email).toBe('test@example.com');
            });

            it('auto-creates user if not exists', async () => {
                mockDocGet.mockResolvedValue({
                    exists: false,
                    data: () => null,
                });

                const req = createRequest('GET', 'valid-token');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data.id).toBe('user-123');
                expect(body.data.email).toBe('test@example.com');
            });

            it('uses token email for new user', async () => {
                mockDocGet.mockResolvedValue({
                    exists: false,
                    data: () => null,
                });

                (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue({
                    uid: 'new-user',
                    email: 'new@example.com',
                });

                const req = createRequest('GET', 'valid-token');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data.email).toBe('new@example.com');
            });
        });

        describe('Error Handling', () => {
            it('returns 500 when Firestore fails', async () => {
                mockDocGet.mockRejectedValue(new Error('Firestore error'));

                const req = createRequest('GET', 'valid-token');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(500);
            });
        });
    });

    describe('PATCH /api/profile', () => {
        describe('Authentication', () => {
            it('returns 401 when Authorization header missing', async () => {
                const req = createRequest('PATCH', undefined, { displayName: 'New Name' });
                const res = await PATCH(req as unknown as NextRequest);

                expect(res.status).toBe(401);
            });
        });

        describe('Validation', () => {
            it('returns 400 when displayName too short', async () => {
                const req = createRequest('PATCH', 'valid-token', { displayName: 'A' });
                const res = await PATCH(req as unknown as NextRequest);

                // Note: depends on UpdateUserProfileRequestSchema validation
                expect(res.status).toBe(400);
            });
        });

        describe('Success Cases', () => {
            it('updates displayName', async () => {
                const req = createRequest('PATCH', 'valid-token', { displayName: 'New Name' });
                const res = await PATCH(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                expect(mockDocSet).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'New Name' }), {
                    merge: true,
                });
            });

            it('updates preferences.autoOpenCamera', async () => {
                const req = createRequest('PATCH', 'valid-token', {
                    preferences: { autoOpenCamera: true },
                });
                const res = await PATCH(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                expect(mockDocSet).toHaveBeenCalledWith(
                    expect.objectContaining({
                        preferences: { autoOpenCamera: true },
                    }),
                    { merge: true },
                );
            });

            it('returns complete updated user object', async () => {
                const req = createRequest('PATCH', 'valid-token', { displayName: 'Updated' });
                const res = await PATCH(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data).toBeDefined();
                expect(body.data.id).toBe('user-123');
            });
        });

        describe('Error Handling', () => {
            it('returns 500 when Firestore update fails', async () => {
                mockDocSet.mockRejectedValue(new Error('Firestore error'));

                const req = createRequest('PATCH', 'valid-token', { displayName: 'New Name' });
                const res = await PATCH(req as unknown as NextRequest);

                expect(res.status).toBe(500);
            });
        });
    });
});
