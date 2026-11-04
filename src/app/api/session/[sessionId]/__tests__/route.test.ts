import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticSession } from '@lemonade/core';
import { NextRequest } from 'next/server';

// Mock adminAuth
vi.mock('@lemonade/infrastructure', async () => {
    const actual = await vi.importActual('@lemonade/infrastructure');
    return {
        ...actual,
        adminAuth: {
            verifyIdToken: vi.fn(),
        },
    };
});

import { adminAuth } from '@lemonade/infrastructure';

// Mocks
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};
const mockSessionRepo = {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
};

// Helper to create request
function createRequest(sessionId: string, token?: string) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return new Request(`http://localhost/api/session/${sessionId}`, {
        method: 'GET',
        headers,
    });
}

// Sample session data
const sampleSession: DiagnosticSession = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    vehicleId: '123e4567-e89b-12d3-a456-426614174001',
    status: 'active',
    complaint: 'Engine noise',
    obdCodes: [],
    messages: [],
    aiAnalysis: null,
    safety_stop: false,
    cumulativeVideoDurationProcessedMinutes: 0,
    cumulativeAudioDurationProcessedMinutes: 0,
    startedAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
};

describe('GET /api/session/[sessionId]', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try {
            container.unbind(TYPES.SessionRepo);
        } catch {}
        container.bind(TYPES.SessionRepo).toConstantValue(mockSessionRepo);

        // Default mock for adminAuth
        (adminAuth.verifyIdToken as Mock).mockResolvedValue({
            uid: 'user-123',
        });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('Authentication', () => {
        it('returns 401 when Authorization header missing', async () => {
            const req = createRequest('123e4567-e89b-12d3-a456-426614174000');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toContain('Missing token');
        });

        it('returns 401 when Bearer prefix missing', async () => {
            const req = new Request('http://localhost/api/session/123', {
                method: 'GET',
                headers: {
                    Authorization: 'token-without-bearer',
                },
            });
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(401);
        });

        it('returns 500 when token verification fails', async () => {
            (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid token'));

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'invalid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            // Firebase token errors are generic errors, not AppErrors
            expect(res.status).toBe(500);
        });

        it('returns 500 when token is expired', async () => {
            (adminAuth.verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Token expired'));

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'expired-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(500);
        });
    });

    describe('Authorization', () => {
        it('returns 403 when user does not own session', async () => {
            (mockSessionRepo.findById as Mock).mockResolvedValue({
                ...sampleSession,
                userId: 'different-user',
            });

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'valid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.error).toContain('Access denied');
        });
    });

    describe('Validation', () => {
        it('returns 400 when sessionId is not UUID format', async () => {
            const req = createRequest('not-a-uuid', 'valid-token');
            const context = { params: { sessionId: 'not-a-uuid' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.code).toBe('VALIDATION_ERROR');
        });

        it('returns 400 when sessionId is empty', async () => {
            const req = createRequest('', 'valid-token');
            const context = { params: { sessionId: '' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(400);
        });
    });

    describe('Success Cases', () => {
        it('returns 200 with session data when authorized', async () => {
            (mockSessionRepo.findById as Mock).mockResolvedValue(sampleSession);

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'valid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.data).toBeDefined();
            expect(body.data.id).toBe(sampleSession.id);
        });

        it('calls verifyIdToken with correct token', async () => {
            (mockSessionRepo.findById as Mock).mockResolvedValue(sampleSession);

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'my-token-123');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            await GET(req as unknown as NextRequest, context);

            expect(adminAuth.verifyIdToken).toHaveBeenCalledWith('my-token-123');
        });
    });

    describe('Not Found', () => {
        it('returns 404 when session does not exist', async () => {
            (mockSessionRepo.findById as Mock).mockResolvedValue(null);

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'valid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(404);
            const body = await res.json();
            expect(body.error).toContain('Session not found');
        });

        it('returns 404 when repository returns undefined', async () => {
            (mockSessionRepo.findById as Mock).mockResolvedValue(undefined);

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'valid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(404);
        });
    });

    describe('Error Handling', () => {
        it('returns 500 when repository throws', async () => {
            mockSessionRepo.findById.mockRejectedValue(new Error('Database error'));

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'valid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            const res = await GET(req as unknown as NextRequest, context);

            expect(res.status).toBe(500);
        });

        it('logs errors', async () => {
            mockSessionRepo.findById.mockRejectedValue(new Error('DB error'));

            const req = createRequest('123e4567-e89b-12d3-a456-426614174000', 'valid-token');
            const context = { params: { sessionId: '123e4567-e89b-12d3-a456-426614174000' } };
            await GET(req as unknown as NextRequest, context);

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
