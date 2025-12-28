import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';

// Mocks
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
};
const mockSessionRepo = {
    findById: vi.fn()
};
const mockStorageService = {
    generateSignedUrl: vi.fn()
};

// Helper to create request
function createRequest(body: object, headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/upload/sign', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    });
}

describe('POST /api/upload/sign', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try { container.unbind(TYPES.SessionRepo); } catch {}
        container.bind(TYPES.SessionRepo).toConstantValue(mockSessionRepo);

        try { container.unbind(TYPES.StorageService); } catch {}
        container.bind(TYPES.StorageService).toConstantValue(mockStorageService);

        // Default mocks
        mockSessionRepo.findById.mockResolvedValue({
            id: '123e4567-e89b-12d3-a456-426614174000',
            userId: 'user-123'
        });
        mockStorageService.generateSignedUrl.mockResolvedValue({
            uploadUrl: 'https://storage.example.com/upload',
            publicUrl: 'https://storage.example.com/public'
        });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('Authentication', () => {
        it('returns 401 when x-user-id header missing', async () => {
            const req = createRequest({
                contentType: 'image/jpeg',
                sessionId: '123e4567-e89b-12d3-a456-426614174000'
            });
            const res = await POST(req);

            expect(res.status).toBe(401);
        });

        it('returns 403 when user does not own session', async () => {
            mockSessionRepo.findById.mockResolvedValue({
                id: '123e4567-e89b-12d3-a456-426614174000',
                userId: 'different-user'
            });

            const req = createRequest(
                { contentType: 'image/jpeg', sessionId: '123e4567-e89b-12d3-a456-426614174000' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(403);
        });
    });

    describe('Validation', () => {
        it('returns 400 when contentType missing', async () => {
            const req = createRequest(
                { sessionId: '123e4567-e89b-12d3-a456-426614174000' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(400);
        });

        it('returns 400 when sessionId not UUID format', async () => {
            const req = createRequest(
                { contentType: 'image/jpeg', sessionId: 'not-uuid' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(400);
        });
    });

    describe('Success Cases', () => {
        it('returns uploadUrl and publicUrl for image/jpeg', async () => {
            const req = createRequest(
                { contentType: 'image/jpeg', sessionId: '123e4567-e89b-12d3-a456-426614174000' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.uploadUrl).toBeDefined();
            expect(body.publicUrl).toBeDefined();
        });

        it('returns uploadUrl and publicUrl for video/mp4', async () => {
            const req = createRequest(
                { contentType: 'video/mp4', sessionId: '123e4567-e89b-12d3-a456-426614174000' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(200);
        });
    });

    describe('Error Handling', () => {
        it('returns 404 when session not found', async () => {
            mockSessionRepo.findById.mockResolvedValue(null);

            const req = createRequest(
                { contentType: 'image/jpeg', sessionId: '123e4567-e89b-12d3-a456-426614174000' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(404);
        });

        it('returns 500 when StorageService fails', async () => {
            mockStorageService.generateSignedUrl.mockRejectedValue(new Error('Storage error'));

            const req = createRequest(
                { contentType: 'image/jpeg', sessionId: '123e4567-e89b-12d3-a456-426614174000' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(500);
        });
    });
});
