import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';

// Mocks
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};
const mockNHTSAService = {
    checkRecalls: vi.fn(),
};

// Helper to create request with query params
function createRequest(queryParams: Record<string, string> = {}) {
    const url = new URL('http://localhost/api/nhtsa/recalls');
    Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    return new Request(url.toString(), { method: 'GET' });
}

describe('GET /api/nhtsa/recalls', () => {
    beforeEach(() => {
        container.snapshot();

        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        try {
            container.unbind(TYPES.NHTSAService);
        } catch {}
        container.bind(TYPES.NHTSAService).toConstantValue(mockNHTSAService);

        // Default mock
        mockNHTSAService.checkRecalls.mockResolvedValue([]);
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('Validation', () => {
        it('returns 400 when year missing', async () => {
            const req = createRequest({ make: 'Honda', model: 'Accord' });
            const res = await GET(req);

            expect(res.status).toBe(400);
        });

        it('returns 400 when make missing', async () => {
            const req = createRequest({ year: '2020', model: 'Accord' });
            const res = await GET(req);

            expect(res.status).toBe(400);
        });

        it('returns 400 when model missing', async () => {
            const req = createRequest({ year: '2020', make: 'Honda' });
            const res = await GET(req);

            expect(res.status).toBe(400);
        });

        it('coerces year string to number', async () => {
            const req = createRequest({ year: '2020', make: 'Honda', model: 'Accord' });
            await GET(req);

            expect(mockNHTSAService.checkRecalls).toHaveBeenCalledWith(2020, 'Honda', 'Accord');
        });
    });

    describe('Success Cases', () => {
        it('returns recalls for valid year/make/model', async () => {
            const recalls = [
                { id: 'recall-1', description: 'Brake issue' },
                { id: 'recall-2', description: 'Airbag issue' },
            ];
            mockNHTSAService.checkRecalls.mockResolvedValue(recalls);

            const req = createRequest({ year: '2020', make: 'Honda', model: 'Accord' });
            const res = await GET(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.recalls).toHaveLength(2);
        });

        it('returns empty array when no recalls found', async () => {
            mockNHTSAService.checkRecalls.mockResolvedValue([]);

            const req = createRequest({ year: '2020', make: 'Honda', model: 'Accord' });
            const res = await GET(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.recalls).toEqual([]);
        });
    });

    describe('Error Handling', () => {
        it('returns 500 when NHTSAService fails', async () => {
            mockNHTSAService.checkRecalls.mockRejectedValue(new Error('NHTSA API error'));

            const req = createRequest({ year: '2020', make: 'Honda', model: 'Accord' });
            const res = await GET(req);

            expect(res.status).toBe(500);
        });
    });
});
