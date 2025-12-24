import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';

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
const mockBillingService = {
    recordUsage: vi.fn().mockResolvedValue(undefined)
};
const mockSessionService = {
    getSessionContext: vi.fn()
};

vi.mock('ai', () => ({
    streamText: vi.fn().mockResolvedValue({
        toTextStreamResponse: () => new Response("AI Stream")
    })
}));

describe('Chat API Route Integration', () => {
    beforeEach(() => {
        container.snapshot();
        
        // Rebind dependencies to mocks
        container.unbind(TYPES.EdgeSecurityService);
        container.bind(TYPES.EdgeSecurityService).toConstantValue(mockSecurity);
        
        container.unbind(TYPES.Logger);
        container.bind(TYPES.Logger).toConstantValue(mockLogger);

        container.unbind(TYPES.BillingService);
        container.bind(TYPES.BillingService).toConstantValue(mockBillingService);

        try {
            container.unbind(TYPES.SessionService);
        } catch {}
        container.bind(TYPES.SessionService).toConstantValue(mockSessionService);
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    it('should return 401 if security check fails', async () => {
        mockSecurity.getAuthenticatedUser.mockResolvedValue(null);

        const req = new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'x-trace-id': 'test-trace' }
        });

        const res = await POST(req);
        
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'Unauthorized: Middleware bypass detected' });
    });

    it('should process a valid request', async () => {
        mockSecurity.getAuthenticatedUser.mockResolvedValue({
            userId: 'user-123',
            tier: 'pro',
            traceId: 'trace-123'
        });

        const req = new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 
                'x-trace-id': 'trace-123',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'hello' }],
                vehicleContext: 'test car'
            })
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe("AI Stream");
    });
});
