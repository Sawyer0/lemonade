import { describe, it, expect, beforeEach } from 'vitest';
import { EdgeSecurityService } from '../EdgeSecurityService';

describe('EdgeSecurityService', () => {
    let service: EdgeSecurityService;

    beforeEach(() => {
        service = new EdgeSecurityService();
    });

    it('should sign and verify a payload correctly', async () => {
        const payload = {
            'x-user-id': 'user-123',
            'x-user-tier': 'pro',
            'x-trace-id': 'trace-456',
        };

        const signature = await service.signPayload(payload);
        expect(signature).toBeDefined();
        expect(signature.length).toBeGreaterThan(0);

        const isValid = await service.verifyPayloadSignature(payload, signature);
        expect(isValid).toBe(true);
    });

    it('should fail verification if payload is tampered', async () => {
        const payload = {
            'x-user-id': 'user-123',
            'x-user-tier': 'pro',
        };

        const signature = await service.signPayload(payload);

        const tamperedPayload = {
            'x-user-id': 'user-123',
            'x-user-tier': 'free', // Tampered!
        };

        const isValid = await service.verifyPayloadSignature(tamperedPayload, signature);
        expect(isValid).toBe(false);
    });

    it('should fail verification if signature is tampered', async () => {
        const payload = {
            'x-user-id': 'user-123',
        };

        const signature = await service.signPayload(payload);
        const tamperedSignature = signature.substring(0, signature.length - 1) + (signature.endsWith('0') ? '1' : '0');

        const isValid = await service.verifyPayloadSignature(payload, tamperedSignature);
        expect(isValid).toBe(false);
    });

    it('should handle getAuthenticatedUser from Request headers', async () => {
        const userId = 'user-789';
        const tier = 'pro';
        const traceId = 'trace-999';

        const payload = {
            'x-user-id': userId,
            'x-user-tier': tier,
            'x-trace-id': traceId,
        };

        const signature = await service.signPayload(payload);

        const headers = new Headers();
        headers.set('x-user-id', userId);
        headers.set('x-user-tier', tier);
        headers.set('x-trace-id', traceId);
        headers.set('x-security-seal', signature);

        const req = {
            headers: headers,
        } as unknown as Request;

        const auth = await service.getAuthenticatedUser(req);

        expect(auth).not.toBeNull();
        expect(auth?.userId).toBe(userId);
        expect(auth?.tier).toBe(tier);
        expect(auth?.traceId).toBe(traceId);
    });
});
