import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { Vehicle } from '@lemonade/core';

// Mocks
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
};
const mockVehicleService = {
    onboardVehicle: vi.fn()
};

// Helper to create request
function createRequest(body: object, headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/vehicles/scan', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    });
}

// Sample vehicle result
const sampleVehicle: Vehicle = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    vin: '1HGBH41JXMN109186',
    specs: {
        year: 2020,
        make: 'Honda',
        model: 'Accord',
        engine: '2.0L Turbo'
    },
    activeIssuesCount: 0,
    createdAt: new Date('2024-01-01')
};

describe('POST /api/vehicles/scan', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try {
            container.unbind(TYPES.VehicleService);
        } catch {}
        container.bind(TYPES.VehicleService).toConstantValue(mockVehicleService);

        // Default successful response
        mockVehicleService.onboardVehicle.mockResolvedValue(sampleVehicle);
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('Authentication', () => {
        it('returns 403 when x-user-id header missing', async () => {
            const req = createRequest({
                vin: '1HGBH41JXMN109186',
                userId: 'user-123'
            });
            const res = await POST(req);

            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.error).toContain('Unauthorized');
        });

        it('returns 403 when x-user-id does not match body userId', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN109186', userId: 'user-123' },
                { 'x-user-id': 'different-user' }
            );
            const res = await POST(req);

            expect(res.status).toBe(403);
        });
    });

    describe('Validation', () => {
        it('returns 400 when VIN shorter than 17 chars', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN1091', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.code).toBe('INVALID_INPUT');
        });

        it('returns 400 when VIN longer than 17 chars', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN10918611', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(400);
        });

        it('returns 400 when userId missing', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN109186' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(400);
        });

        it('returns 400 when VIN missing', async () => {
            const req = createRequest(
                { userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(400);
        });
    });

    describe('Success Cases', () => {
        it('returns 200 with vehicle data on valid VIN', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN109186', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
            expect(body.data.id).toBe(sampleVehicle.id);
        });

        it('calls VehicleService.onboardVehicle with correct params', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN109186', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            await POST(req);

            expect(mockVehicleService.onboardVehicle).toHaveBeenCalledWith(
                '1HGBH41JXMN109186',
                'user-123'
            );
        });

        it('logs VIN masked to last 4 characters', async () => {
            const req = createRequest(
                { vin: '1HGBH41JXMN109186', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            await POST(req);

            expect(mockLogger.info).toHaveBeenCalledWith(
                'Vehicle scan initiated',
                expect.objectContaining({ vin: '9186' })
            );
        });
    });

    describe('Error Handling', () => {
        it('returns 500 when VehicleService.onboardVehicle fails', async () => {
            mockVehicleService.onboardVehicle.mockRejectedValue(new Error('VIN decode failed'));

            const req = createRequest(
                { vin: '1HGBH41JXMN109186', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            const res = await POST(req);

            expect(res.status).toBe(500);
        });

        it('logs error when service fails', async () => {
            mockVehicleService.onboardVehicle.mockRejectedValue(new Error('Service error'));

            const req = createRequest(
                { vin: '1HGBH41JXMN109186', userId: 'user-123' },
                { 'x-user-id': 'user-123' }
            );
            await POST(req);

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
