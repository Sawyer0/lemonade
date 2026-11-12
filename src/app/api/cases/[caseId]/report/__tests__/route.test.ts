import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { GET } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import type { Case } from '@lemonade/core';
import { AppError, ErrorCode } from '@lemonade/core';
import { buildGoldenCase } from '@lemonade/core/goal/__tests__/fixtures/goldenCase';
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
const closedCase: Case = {
    id: caseId,
    vehicleId: 'vehicle-1',
    userId: 'user-123',
    status: 'closed',
    version: 2,
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
    return new Request(`http://localhost/api/cases/${caseId}/report`, {
        method: 'GET',
        headers,
    });
}

describe('GET /api/cases/[caseId]/report', () => {
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
        const { entries } = buildGoldenCase();
        mockCaseService.getCase.mockResolvedValue({ caseRecord: closedCase, entries });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('returns the report built from the ledger', async () => {
        const req = createRequest('valid-token');
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.caseId).toBe(caseId);
        expect(body.data.caseStatus).toBe('closed');
        expect(body.data.vehicle.vin).toBe('1HGCM82633A004352');
        expect(body.data.complaint.text).toBe('Misfire on cylinder 1 at idle');
        expect(body.data.codes.map((code: { code: string }) => code.code)).toContain('P0300');
        expect(body.data.differential[0].hypothesis).toBe('Head gasket leak');
        expect(body.data.tests.map((test: { name: string }) => test.name)).toContain(
            'compression-cylinder-1',
        );
        expect(body.data.repair.repairPerformed).toBe('Replaced head gasket');
        expect(body.data.outcome.confirmed).toBe(true);
        expect(mockCaseService.getCase).toHaveBeenCalledWith(caseId, 'user-123');
    });

    it('links every report statement to a ledger entry', async () => {
        const req = createRequest('valid-token');
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });
        const body = await res.json();
        const { entries } = buildGoldenCase();
        const entryIds = new Set(entries.map((entry) => entry.id));

        const collectCitations = (value: unknown): string[] => {
            if (value === null || typeof value !== 'object') {
                return [];
            }
            if (Array.isArray(value)) {
                return value.flatMap(collectCitations);
            }
            const record = value as Record<string, unknown>;
            if (typeof record['entryId'] === 'string') {
                return [record['entryId']];
            }
            return Object.values(record).flatMap(collectCitations);
        };

        const cited = collectCitations(body.data);
        expect(cited.length).toBeGreaterThan(0);
        for (const entryId of cited) {
            expect(entryIds.has(entryId)).toBe(true);
        }
    });

    it('answers 401 without a token', async () => {
        const req = createRequest();
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(401);
        expect(mockCaseService.getCase).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown case', async () => {
        mockCaseService.getCase.mockRejectedValue(
            new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`),
        );
        const req = createRequest('valid-token');
        const res = await GET(req as unknown as NextRequest, { params: { caseId } });

        expect(res.status).toBe(404);
    });
});
