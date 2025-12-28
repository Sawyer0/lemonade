import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET, POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticSession } from '@lemonade/core';
import { NextRequest } from 'next/server';

// Mocks
const mockSecurity = {
    getAuthenticatedUser: vi.fn()
};
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
};
const mockSessionRepo = {
    findByUserId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn()
};

// Helper to create request
function createRequest(method: string, body?: object, headers: Record<string, string> = {}) {
    const options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    return new Request('http://localhost/api/session', options);
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
    updatedAt: new Date('2024-01-01')
};

describe('Session API Route', () => {
    beforeEach(() => {
        container.snapshot();

        // Rebind dependencies to mocks
        container.unbind(TYPES.EdgeSecurityService);
        container.bind(TYPES.EdgeSecurityService).toConstantValue(mockSecurity);

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try {
            container.unbind(TYPES.SessionRepo);
        } catch {}
        container.bind(TYPES.SessionRepo).toConstantValue(mockSessionRepo);

        // Default authenticated user
        mockSecurity.getAuthenticatedUser.mockResolvedValue({
            userId: 'user-123',
            tier: 'free',
            traceId: 'trace-123'
        });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('GET /api/session', () => {
        describe('Authentication', () => {
            it('returns 401 when security check fails', async () => {
                mockSecurity.getAuthenticatedUser.mockResolvedValue(null);

                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(401);
                expect(await res.json()).toEqual({ error: 'Unauthorized: Middleware bypass detected' });
            });

            it('returns 401 when authentication returns undefined', async () => {
                mockSecurity.getAuthenticatedUser.mockResolvedValue(undefined);

                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(401);
            });
        });

        describe('Success Cases', () => {
            it('returns empty array when user has no sessions', async () => {
                mockSessionRepo.findByUserId.mockResolvedValue([]);

                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data).toEqual([]);
            });

            it('returns sessions filtered by userId', async () => {
                mockSessionRepo.findByUserId.mockResolvedValue([sampleSession]);

                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data).toHaveLength(1);
                expect(body.data[0].userId).toBe('user-123');
                expect(mockSessionRepo.findByUserId).toHaveBeenCalledWith('user-123');
            });

            it('returns multiple sessions', async () => {
                const sessions = [
                    sampleSession,
                    { ...sampleSession, id: '123e4567-e89b-12d3-a456-426614174002' }
                ];
                mockSessionRepo.findByUserId.mockResolvedValue(sessions);

                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.data).toHaveLength(2);
            });
        });

        describe('Error Handling', () => {
            it('returns 500 when SessionRepository.findByUserId throws', async () => {
                mockSessionRepo.findByUserId.mockRejectedValue(new Error('Database error'));

                const req = createRequest('GET');
                const res = await GET(req as unknown as NextRequest);

                expect(res.status).toBe(500);
                const body = await res.json();
                expect(body.error).toBeDefined();
            });

            it('logs error when repository fails', async () => {
                mockSessionRepo.findByUserId.mockRejectedValue(new Error('DB connection lost'));

                const req = createRequest('GET');
                await GET(req as unknown as NextRequest);

                expect(mockLogger.error).toHaveBeenCalled();
            });
        });
    });

    describe('POST /api/session', () => {
        const validBody = {
            vehicleId: '123e4567-e89b-12d3-a456-426614174001',
            complaint: 'Engine makes noise'
        };

        describe('Authentication', () => {
            it('returns 401 when security check fails', async () => {
                mockSecurity.getAuthenticatedUser.mockResolvedValue(null);

                const req = createRequest('POST', validBody);
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(401);
                expect(await res.json()).toEqual({ error: 'Unauthorized: Middleware bypass detected' });
            });
        });

        describe('Validation', () => {
            it('returns 400 when vehicleId missing', async () => {
                const req = createRequest('POST', { complaint: 'noise' });
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(400);
                const body = await res.json();
                expect(body.error).toBeDefined();
                expect(body.code).toBe('VALIDATION_ERROR');
            });

            it('returns 400 when vehicleId is not UUID format', async () => {
                const req = createRequest('POST', {
                    vehicleId: 'not-a-uuid',
                    complaint: 'noise'
                });
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(400);
                const body = await res.json();
                expect(body.code).toBe('VALIDATION_ERROR');
            });

            it('returns 400 when vehicleId is empty string', async () => {
                const req = createRequest('POST', {
                    vehicleId: '',
                    complaint: 'noise'
                });
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(400);
            });

            it('accepts optional complaint field', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', {
                    vehicleId: '123e4567-e89b-12d3-a456-426614174001'
                });
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(200);
            });

            it('handles empty complaint string', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', {
                    vehicleId: '123e4567-e89b-12d3-a456-426614174001',
                    complaint: ''
                });
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(200);
            });
        });

        describe('Success Cases', () => {
            it('creates session with correct defaults', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', validBody);
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                expect(mockSessionRepo.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        userId: 'user-123',
                        vehicleId: validBody.vehicleId,
                        status: 'active',
                        complaint: validBody.complaint,
                        obdCodes: [],
                        messages: [],
                        aiAnalysis: null,
                        safety_stop: false
                    })
                );
            });

            it('returns valid UUID sessionId', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', validBody);
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(200);
                const body = await res.json();
                expect(body.sessionId).toBeDefined();
                // UUID v4 format check
                expect(body.sessionId).toMatch(
                    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                );
            });

            it('sets status to active', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', validBody);
                await POST(req as unknown as NextRequest);

                expect(mockSessionRepo.create).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'active' })
                );
            });

            it('initializes empty message history', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', validBody);
                await POST(req as unknown as NextRequest);

                expect(mockSessionRepo.create).toHaveBeenCalledWith(
                    expect.objectContaining({ messages: [] })
                );
            });

            it('sets complaint to null when not provided', async () => {
                mockSessionRepo.create.mockResolvedValue(undefined);

                const req = createRequest('POST', {
                    vehicleId: '123e4567-e89b-12d3-a456-426614174001'
                });
                await POST(req as unknown as NextRequest);

                expect(mockSessionRepo.create).toHaveBeenCalledWith(
                    expect.objectContaining({ complaint: null })
                );
            });
        });

        describe('Error Handling', () => {
            it('returns 500 when SessionRepository.create throws', async () => {
                mockSessionRepo.create.mockRejectedValue(new Error('Database error'));

                const req = createRequest('POST', validBody);
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(500);
            });

            it('handles malformed JSON body', async () => {
                const req = new Request('http://localhost/api/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: 'not valid json'
                });
                const res = await POST(req as unknown as NextRequest);

                expect(res.status).toBe(500);
            });
        });
    });
});
