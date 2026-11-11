import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import type { Case, LedgerEntry, OutcomePayload } from '@lemonade/core';
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

const confirmedOutcome: OutcomePayload = {
    repairPerformed: 'Replaced radiator hose',
    partsReplaced: ['Radiator hose'],
    codesCleared: true,
    symptomGone: true,
    retestPassed: true,
    confirmed: true,
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
const outcomeEntry = {
    id: uuidv4(),
    caseId,
    sequence: 1,
    type: 'outcome',
    actor: { kind: 'user', id: 'user-123' },
    source: 'tech',
    occurredAt: new Date(),
    payload: confirmedOutcome,
    previousHash: 'a'.repeat(64),
    entryHash: 'b'.repeat(64),
    createdAt: new Date(),
} as LedgerEntry;

const mockCaseService = {
    getCase: vi.fn(),
    closeCase: vi.fn(),
};

function createRequest(body?: object, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return new Request(`http://localhost/api/cases/${caseId}/close`, {
        method: 'POST',
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

describe('POST /api/cases/[caseId]/close', () => {
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
        mockCaseService.closeCase.mockResolvedValue({
            closedCase: { ...openCase, status: 'closed' },
            outcomeEntry,
        });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('closes the case and returns the closed case and outcome entry', async () => {
        const req = createRequest({ outcome: confirmedOutcome }, 'valid-token');
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.case.status).toBe('closed');
        expect(body.data.outcomeEntry.id).toBe(outcomeEntry.id);
        expect(mockCaseService.closeCase).toHaveBeenCalledWith(caseId, 'user-123', confirmedOutcome);
    });

    it('returns 401 when Authorization header is missing', async () => {
        const req = createRequest({ outcome: confirmedOutcome });
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(401);
        expect(mockCaseService.closeCase).not.toHaveBeenCalled();
    });

    it('returns 400 when the outcome claims confirmed without all checks', async () => {
        const req = createRequest({ outcome: { ...confirmedOutcome, retestPassed: false } }, 'valid-token');
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(400);
        expect(mockCaseService.closeCase).not.toHaveBeenCalled();
    });

    it('returns 400 when the repair performed is missing', async () => {
        const { repairPerformed: _repairPerformed, ...withoutRepair } = confirmedOutcome;
        const req = createRequest({ outcome: withoutRepair }, 'valid-token');
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(400);
        expect(mockCaseService.closeCase).not.toHaveBeenCalled();
    });

    it('returns 409 when the case is already closed', async () => {
        mockCaseService.closeCase.mockRejectedValue(
            new AppError(ErrorCode.RESOURCE_ALREADY_EXISTS, 'Case is already closed'),
        );
        const req = createRequest({ outcome: confirmedOutcome }, 'valid-token');
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(409);
    });

    it('returns 403 when the caller does not own the case', async () => {
        mockCaseService.closeCase.mockRejectedValue(new AppError(ErrorCode.FORBIDDEN, 'You do not own this case', 403));
        const req = createRequest({ outcome: confirmedOutcome }, 'valid-token');
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(403);
    });

    it('returns 404 when the case does not exist', async () => {
        mockCaseService.closeCase.mockRejectedValue(new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Case not found'));
        const req = createRequest({ outcome: confirmedOutcome }, 'valid-token');
        const res = await POST(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(404);
    });
});
