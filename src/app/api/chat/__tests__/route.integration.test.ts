import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { StreamingEvent } from '@lemonade/core';

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
const mockChatService = {
    handleChatInteractionStream: vi.fn()
};

// Helper to create mock stream generator yielding NDJSON events
function createMockStream(chunks: string[]) {
    return async function* (): AsyncGenerator<StreamingEvent, void, unknown> {
        for (const chunk of chunks) {
            yield { type: 'text', content: chunk };
        }
        yield { type: 'done' };
    };
}

// Helper to create authenticated request
function createAuthenticatedRequest(body: object, headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
            'x-trace-id': 'trace-123',
            'Content-Type': 'application/json',
            'x-session-id': 'session-123',
            ...headers
        },
        body: JSON.stringify(body)
    });
}

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
        } catch {} // Ignore if not bound
        container.bind(TYPES.SessionService).toConstantValue(mockSessionService);

        try {
            container.unbind(TYPES.ChatService);
        } catch {} // Ignore if not bound
        container.bind(TYPES.ChatService).toConstantValue(mockChatService);

        // Default authenticated user
        mockSecurity.getAuthenticatedUser.mockResolvedValue({
            userId: 'user-123',
            tier: 'pro',
            traceId: 'trace-123'
        });
    });

    afterEach(() => {
        container.restore();
        vi.clearAllMocks();
    });

    describe('Authentication', () => {
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

        it('should return 401 when authentication returns undefined', async () => {
            mockSecurity.getAuthenticatedUser.mockResolvedValue(undefined);

            const req = new Request('http://localhost/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
            });

            const res = await POST(req);
            expect(res.status).toBe(401);
        });
    });

    describe('Request Validation', () => {
        it('should return 400 when messages array has no user message', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const req = createAuthenticatedRequest({
                messages: [{ role: 'assistant', content: 'I am AI' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.error).toContain('No user message found');
        });

        it('should return 400 when last message is not from user', async () => {
            const req = createAuthenticatedRequest({
                messages: [
                    { role: 'user', content: 'hello' },
                    { role: 'assistant', content: 'hi there' }
                ]
            });

            const res = await POST(req);
            expect(res.status).toBe(400);
            expect(await res.json()).toEqual({ error: 'Invalid request: No user message found' });
        });

        it('should handle MessagePart[] content format', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const req = createAuthenticatedRequest({
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is this?' },
                        { type: 'image', image: 'data:image/jpeg;base64,...' }
                    ]
                }]
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(mockChatService.handleChatInteractionStream).toHaveBeenCalledWith(
                'session-123',
                expect.arrayContaining([
                    expect.objectContaining({ type: 'text', text: 'What is this?' })
                ]),
                undefined,
                undefined
            );
        });

        it('should handle string content format', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'simple text message' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(mockChatService.handleChatInteractionStream).toHaveBeenCalledWith(
                'session-123',
                'simple text message',
                undefined,
                undefined
            );
        });

        it('should use default session ID when x-session-id header missing', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const req = new Request('http://localhost/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'hello' }]
                })
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(mockChatService.handleChatInteractionStream).toHaveBeenCalledWith(
                '00000000-0000-0000-0000-000000000000',
                'hello',
                undefined,
                undefined
            );
        });
    });

    describe('Streaming Response', () => {
        it('should process a valid request', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(["AI Response Chunk"])());

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
            const text = await res.text();
            expect(text).toContain('{"type":"text","content":"AI Response Chunk"}');
            expect(text).toContain('{"type":"done"}');
        });

        it('should include x-trace-id in response headers', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['chunk'])());

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.headers.get('x-trace-id')).toBeDefined();
        });

        it('should stream multiple chunks correctly', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(
                createMockStream(['Hello', ' ', 'World', '!'])()
            );

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            const text = await res.text();
            expect(text).toContain('{"type":"text","content":"Hello"}');
            expect(text).toContain('{"type":"text","content":" "}');
            expect(text).toContain('{"type":"text","content":"World"}');
            expect(text).toContain('{"type":"text","content":"!"}');
        });

        it('should handle empty stream response', async () => {
            async function* emptyStream() { yield { type: 'done' }; } // Explicitly yield done
            mockChatService.handleChatInteractionStream.mockReturnValue(emptyStream());

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(await res.text()).toBe(JSON.stringify({ type: 'done' }) + '\n');
        });

        it('should set correct content-type header', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['test'])());

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
        });
    });

    describe('Vehicle Context', () => {
        it('should pass vehicleContext to ChatService when provided', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const vehicleContext = {
                year: 2020,
                make: 'Toyota',
                model: 'Camry',
                vin: '1234567890ABCDEFG'
            };

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'what is wrong with my car?' }],
                vehicleContext
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(mockChatService.handleChatInteractionStream).toHaveBeenCalledWith(
                'session-123',
                'what is wrong with my car?',
                vehicleContext,
                undefined
            );
        });

        it('should work without vehicleContext', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(mockChatService.handleChatInteractionStream).toHaveBeenCalledWith(
                'session-123',
                'hello',
                undefined,
                undefined
            );
        });

        it('should pass diagnosticContext when provided', async () => {
            mockChatService.handleChatInteractionStream.mockReturnValue(createMockStream(['response'])());

            const diagnosticContext = {
                diagnosis: 'Engine noise detected',
                confidence: 0.85,
                investigationPlan: []
            };

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'analyze this' }],
                diagnosticContext
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            expect(mockChatService.handleChatInteractionStream).toHaveBeenCalledWith(
                'session-123',
                'analyze this',
                undefined,
                diagnosticContext
            );
        });
    });

    describe('Error Handling', () => {
        it('should return 500 when ChatService throws', async () => {
            mockChatService.handleChatInteractionStream.mockImplementation(() => {
                throw new Error('ChatService failed');
            });

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(500);
            expect(await res.json()).toEqual({ error: 'ChatService failed' });
        });

        it('should log errors with trace context', async () => {
            mockChatService.handleChatInteractionStream.mockImplementation(() => {
                throw new Error('Service error');
            });

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            await POST(req);
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Chat Failed'),
                expect.any(Error)
            );
        });

        it('should handle malformed JSON body', async () => {
            const req = new Request('http://localhost/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: 'not valid json'
            });

            const res = await POST(req);
            expect(res.status).toBe(500);
        });

        it('should return generic error message for non-Error exceptions', async () => {
            mockChatService.handleChatInteractionStream.mockImplementation(() => {
                throw 'string error';
            });

            const req = createAuthenticatedRequest({
                messages: [{ role: 'user', content: 'hello' }]
            });

            const res = await POST(req);
            expect(res.status).toBe(500);
            expect(await res.json()).toEqual({ error: 'Internal Server Error' });
        });
    });
});