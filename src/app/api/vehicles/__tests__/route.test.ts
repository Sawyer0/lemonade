import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { Vehicle } from '@lemonade/core';

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
const mockVehicleRepo = {
    findByUser: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
};

// Helper to create request with query params
function createRequest(queryParams: Record<string, string> = {}) {
    const url = new URL('http://localhost/api/vehicles');
    Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    return new Request(url.toString(), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

// Sample vehicle data matching VehicleSchema
const sampleVehicle: Vehicle = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    vin: '1HGBH41JXMN109186',  // 17 chars
    specs: {
        year: 2020,
        make: 'Honda',
        model: 'Accord',
        engine: '2.0L Turbo'
    },
    activeIssuesCount: 0,
    createdAt: new Date('2024-01-01')
};

describe('GET /api/vehicles', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.EdgeSecurityService);
        container.bind(TYPES.EdgeSecurityService).toConstantValue(mockSecurity);

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try {
            container.unbind(TYPES.VehicleRepo);
        } catch {}
        container.bind(TYPES.VehicleRepo).toConstantValue(mockVehicleRepo);

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

    describe('Authentication', () => {
        it('returns 403 when security check fails', async () => {
            mockSecurity.getAuthenticatedUser.mockResolvedValue(null);

            const req = createRequest({ userId: 'user-123' });
            const res = await GET(req);

            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.error).toContain('Unauthorized');
        });

        it('returns 403 when userId query param does not match auth userId', async () => {
            mockSecurity.getAuthenticatedUser.mockResolvedValue({
                userId: 'different-user',
                tier: 'free',
                traceId: 'trace-123'
            });

            const req = createRequest({ userId: 'user-123' });
            const res = await GET(req);

            expect(res.status).toBe(403);
        });
    });

    describe('Validation', () => {
        it('returns 400 when userId query param missing', async () => {
            const req = createRequest({});
            const res = await GET(req);

            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.code).toBe('INVALID_INPUT');
        });

        it('returns 400 when userId is empty string', async () => {
            const req = createRequest({ userId: '' });
            const res = await GET(req);

            expect(res.status).toBe(400);
        });
    });

    describe('Success Cases', () => {
        it('returns 200 with empty array when no vehicles', async () => {
            mockVehicleRepo.findByUser.mockResolvedValue([]);

            const req = createRequest({ userId: 'user-123' });
            const res = await GET(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.data).toEqual([]);
        });

        it('returns 200 with vehicles for user', async () => {
            mockVehicleRepo.findByUser.mockResolvedValue([sampleVehicle]);

            const req = createRequest({ userId: 'user-123' });
            const res = await GET(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.data).toHaveLength(1);
            expect(body.data[0].id).toBe(sampleVehicle.id);
        });

        it('returns multiple vehicles', async () => {
            const vehicles = [
                sampleVehicle,
                {
                    ...sampleVehicle,
                    id: '123e4567-e89b-12d3-a456-426614174001',
                    specs: { ...sampleVehicle.specs, model: 'Civic' }
                }
            ];
            mockVehicleRepo.findByUser.mockResolvedValue(vehicles);

            const req = createRequest({ userId: 'user-123' });
            const res = await GET(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.data).toHaveLength(2);
        });

        it('calls VehicleRepository with correct userId', async () => {
            mockVehicleRepo.findByUser.mockResolvedValue([]);

            const req = createRequest({ userId: 'user-123' });
            await GET(req);

            expect(mockVehicleRepo.findByUser).toHaveBeenCalledWith('user-123');
        });
    });

    describe('Error Handling', () => {
        it('returns 500 when VehicleRepository.findByUser throws', async () => {
            mockVehicleRepo.findByUser.mockRejectedValue(new Error('Database error'));

            const req = createRequest({ userId: 'user-123' });
            const res = await GET(req);

            expect(res.status).toBe(500);
        });

        it('logs error when repository fails', async () => {
            mockVehicleRepo.findByUser.mockRejectedValue(new Error('DB connection lost'));

            const req = createRequest({ userId: 'user-123' });
            await GET(req);

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
