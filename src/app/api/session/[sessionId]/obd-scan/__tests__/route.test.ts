import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { AppError, ErrorCode, type ObdScanResult } from '@lemonade/core';
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

const mockSessionService = {
    recordObdScan: vi.fn(),
    recordObdLedgerEvent: vi.fn(),
};

function createRequest(sessionId: string, body: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return new Request(`http://localhost/api/session/${sessionId}/obd-scan`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

function buildScan(): ObdScanResult {
    return {
        adapter: { name: 'OBDLink CX', transport: 'ble', model: 'OBDLink CX' },
        capturedAt: '2026-11-11T15:00:00.000Z',
        storedCodes: ['P0300'],
        pendingCodes: ['P0300'],
        permanentCodes: [],
        freezeFrame: null,
        mode06: [],
        readiness: { milOn: true, storedCodeCount: 1, monitors: [] },
        vin: '1HGCM82633A004352',
        calibrationIds: [],
        calibrationVerificationNumbers: [],
        liveReadings: [],
    };
}

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('POST /api/session/[sessionId]/obd-scan', () => {
    beforeEach(() => {
        container.snapshot();
        container.unbind(TYPES.SessionService);
        container.bind(TYPES.SessionService).toConstantValue(mockSessionService);
        (adminAuth.verifyIdToken as Mock).mockResolvedValue({ uid: 'user-123' });
        mockSessionService.recordObdScan.mockImplementation(
            async (_sessionId: string, _userId: string, scan: ObdScanResult) => scan,
        );
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('records a valid scan and returns it', async () => {
        const scan = buildScan();
        const req = createRequest(SESSION_ID, scan, 'token');
        const res = await POST(req as unknown as NextRequest, { params: { sessionId: SESSION_ID } });

        expect(res.status).toBe(200);
        expect((await res.json()).data).toEqual(scan);
        expect(mockSessionService.recordObdScan).toHaveBeenCalledWith(SESSION_ID, 'user-123', scan);
    });

    it('returns 401 when the Authorization header is missing', async () => {
        const res = await POST(createRequest(SESSION_ID, buildScan()) as unknown as NextRequest, {
            params: { sessionId: SESSION_ID },
        });

        expect(res.status).toBe(401);
        expect(mockSessionService.recordObdScan).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed scan body', async () => {
        const res = await POST(
            createRequest(SESSION_ID, { ...buildScan(), vin: 'too-short' }, 'token') as unknown as NextRequest,
            { params: { sessionId: SESSION_ID } },
        );

        expect(res.status).toBe(400);
        expect(mockSessionService.recordObdScan).not.toHaveBeenCalled();
    });

    it('passes a service 404 through', async () => {
        mockSessionService.recordObdScan.mockRejectedValue(
            new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found'),
        );

        const res = await POST(createRequest(SESSION_ID, buildScan(), 'token') as unknown as NextRequest, {
            params: { sessionId: SESSION_ID },
        });

        expect(res.status).toBe(404);
    });
});
