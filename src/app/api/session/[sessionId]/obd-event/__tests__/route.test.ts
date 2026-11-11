import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { AppError, ErrorCode } from '@lemonade/core';
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
    return new Request(`http://localhost/api/session/${sessionId}/obd-event`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

const GUIDED_TEST_BODY = {
    type: 'guided_test',
    payload: {
        definitionId: 'hold-2500-rpm',
        definitionName: 'Hold 2,500 RPM',
        result: 'pass',
        checks: [
            {
                pid: '0C',
                label: 'Engine RPM',
                unit: 'rpm',
                observedMin: 2450,
                observedMax: 2550,
                expectedMin: 2400,
                expectedMax: 2600,
                passed: true,
            },
        ],
        samplesRecorded: 30,
        startedAt: '2026-11-11T15:00:00.000Z',
        endedAt: '2026-11-11T15:00:30.000Z',
    },
};

describe('POST /api/session/[sessionId]/obd-event', () => {
    beforeEach(() => {
        container.snapshot();
        container.unbind(TYPES.SessionService);
        container.bind(TYPES.SessionService).toConstantValue(mockSessionService);
        (adminAuth.verifyIdToken as Mock).mockResolvedValue({ uid: 'user-123' });
        mockSessionService.recordObdLedgerEvent.mockResolvedValue(undefined);
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('records a guided-test outcome', async () => {
        const res = await POST(createRequest(SESSION_ID, GUIDED_TEST_BODY, 'token') as unknown as NextRequest, {
            params: { sessionId: SESSION_ID },
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { recorded: true, type: 'guided_test' } });
        expect(mockSessionService.recordObdLedgerEvent).toHaveBeenCalledWith(SESSION_ID, 'user-123', GUIDED_TEST_BODY);
    });

    it('records a verify-fix verdict', async () => {
        const body = {
            type: 'verify_fix',
            payload: {
                clearedAt: '2026-11-11T15:00:00.000Z',
                rescannedAt: '2026-11-11T15:30:00.000Z',
                driveCycleCompleted: true,
                monitorsReady: true,
                monitorsNotReady: [],
                returnedStoredCodes: [],
                returnedPendingCodes: [],
                returnedPermanentCodes: [],
                passed: true,
            },
        };

        const res = await POST(createRequest(SESSION_ID, body, 'token') as unknown as NextRequest, {
            params: { sessionId: SESSION_ID },
        });

        expect(res.status).toBe(200);
        expect(mockSessionService.recordObdLedgerEvent).toHaveBeenCalledWith(SESSION_ID, 'user-123', body);
    });

    it('returns 401 when the Authorization header is missing', async () => {
        const res = await POST(createRequest(SESSION_ID, GUIDED_TEST_BODY) as unknown as NextRequest, {
            params: { sessionId: SESSION_ID },
        });

        expect(res.status).toBe(401);
        expect(mockSessionService.recordObdLedgerEvent).not.toHaveBeenCalled();
    });

    it('returns 400 for an unknown event type', async () => {
        const res = await POST(
            createRequest(SESSION_ID, { type: 'test_result', payload: {} }, 'token') as unknown as NextRequest,
            { params: { sessionId: SESSION_ID } },
        );

        expect(res.status).toBe(400);
        expect(mockSessionService.recordObdLedgerEvent).not.toHaveBeenCalled();
    });

    it('passes a service 400 through when the session has no case', async () => {
        mockSessionService.recordObdLedgerEvent.mockRejectedValue(
            new AppError(ErrorCode.INVALID_INPUT, 'Session is not attached to a case'),
        );

        const res = await POST(createRequest(SESSION_ID, GUIDED_TEST_BODY, 'token') as unknown as NextRequest, {
            params: { sessionId: SESSION_ID },
        });

        expect(res.status).toBe(400);
    });
});
