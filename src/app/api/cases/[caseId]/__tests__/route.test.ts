import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { GET } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import type { Case, LedgerEntry } from '@lemonade/core';
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

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

const caseId = uuidv4();
const openCase: Case = {
    id: caseId,
    vehicleId: 'vehicle-1',
    userId: 'user-123',
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockCaseService = {
    getCase: vi.fn(),
    closeCase: vi.fn(),
};

function createRequest(token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return new Request(`http://localhost/api/cases/${caseId}`, {
        method: 'GET',
        headers,
    });
}

describe('GET /api/cases/[caseId]', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try {
            container.unbind(TYPES.CaseService);
        } catch {
            // First run: the binding exists in the container, but unbind
            // throws when a previous test already removed it.
        }
        container.bind(TYPES.CaseService).toConstantValue(mockCaseService);

        (adminAuth.verifyIdToken as Mock).mockResolvedValue({ uid: 'user-123' });
        mockCaseService.getCase.mockResolvedValue({ caseRecord: openCase, entries: [] as LedgerEntry[] });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('returns the case with its entries', async () => {
        const req = createRequest('valid-token');
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.case.id).toBe(caseId);
        expect(body.data.case.status).toBe('open');
        expect(body.data.entries).toEqual([]);
        expect(mockCaseService.getCase).toHaveBeenCalledWith(caseId, 'user-123');
    });

    it('returns 401 when Authorization header is missing', async () => {
        const req = createRequest();
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(401);
        expect(mockCaseService.getCase).not.toHaveBeenCalled();
    });

    it('returns 403 when the caller does not own the case', async () => {
        mockCaseService.getCase.mockRejectedValue(new AppError(ErrorCode.FORBIDDEN, 'You do not own this case', 403));
        const req = createRequest('valid-token');
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(403);
    });

    it('returns 404 when the case does not exist', async () => {
        mockCaseService.getCase.mockRejectedValue(new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Case not found'));
        const req = createRequest('valid-token');
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(404);
    });
});
