import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import type { DiagnosticSession, Vehicle } from '@lemonade/core';

const mockSecurity = { getAuthenticatedUser: vi.fn() };
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const mockVehicleService = { getVehicle: vi.fn(), getHistory: vi.fn() };

const VEHICLE_ID = '123e4567-e89b-12d3-a456-426614174000';

const vehicle: Vehicle = {
    id: VEHICLE_ID,
    userId: 'user-123',
    vin: '1HGCM82633A004352',
    specs: { year: 2003, make: 'HONDA', model: 'Accord', engine: '3.0L' },
    activeIssuesCount: 0,
    createdAt: new Date('2026-01-01'),
};

function session(id: string, updatedAt: string): DiagnosticSession {
    return {
        id,
        vehicleId: VEHICLE_ID,
        userId: 'user-123',
        status: 'active',
        complaint: 'Brakes squeal',
        obdCodes: [],
        messages: [],
        aiAnalysis: null,
        safety_stop: false,
        cumulativeVideoDurationProcessedMinutes: 0,
        cumulativeAudioDurationProcessedMinutes: 0,
        startedAt: new Date(updatedAt),
        updatedAt: new Date(updatedAt),
    } as DiagnosticSession;
}

const call = (id = VEHICLE_ID) =>
    GET(new Request(`http://localhost/api/vehicles/${id}/history`), { params: Promise.resolve({ id }) });

describe('GET /api/vehicles/[id]/history', () => {
    beforeEach(() => {
        container.snapshot();
        container.unbind(TYPES.EdgeSecurityService);
        container.bind(TYPES.EdgeSecurityService).toConstantValue(mockSecurity);
        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);
        container.unbind(TYPES.VehicleService);
        container.bind(TYPES.VehicleService).toConstantValue(mockVehicleService);

        mockSecurity.getAuthenticatedUser.mockResolvedValue({ userId: 'user-123', tier: 'free', traceId: 't' });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('returns 401 without an authenticated user', async () => {
        mockSecurity.getAuthenticatedUser.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(401);
        expect(mockVehicleService.getVehicle).not.toHaveBeenCalled();
    });

    it("returns 404 for a vehicle the caller doesn't own", async () => {
        mockVehicleService.getVehicle.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(404);
        expect(mockVehicleService.getVehicle).toHaveBeenCalledWith(VEHICLE_ID, 'user-123');
        expect(mockVehicleService.getHistory).not.toHaveBeenCalled();
    });

    it('returns the vehicle and its sessions, newest first, scoped to the caller', async () => {
        const older = session('11111111-1111-4111-8111-111111111111', '2026-03-01T10:00:00Z');
        const newer = session('22222222-2222-4222-8222-222222222222', '2026-04-01T10:00:00Z');
        mockVehicleService.getVehicle.mockResolvedValue(vehicle);
        mockVehicleService.getHistory.mockResolvedValue([older, newer]);

        const res = await call();

        expect(res.status).toBe(200);
        expect(mockVehicleService.getHistory).toHaveBeenCalledWith(VEHICLE_ID, 'user-123');
        const body = await res.json();
        expect(body.data.vehicle.vin).toBe(vehicle.vin);
        expect(body.data.sessions.map((s: { id: string }) => s.id)).toEqual([newer.id, older.id]);
    });

    it('returns 500 when the lookup fails', async () => {
        mockVehicleService.getVehicle.mockRejectedValue(new Error('db down'));
        const res = await call();
        expect(res.status).toBe(500);
    });
});
