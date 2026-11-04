import { IEdgeSecurityService } from '@lemonade/core';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { injectable } from 'inversify';
import { CONFIG } from '../config';
import { resolveInternalSecret } from './internalSecret';

const JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

@injectable()
export class EdgeSecurityService implements IEdgeSecurityService {
    private secretKey?: Promise<CryptoKey>;

    /** Imported on first use, so a missing production secret fails the first sealed request, not the build. */
    private hmacKey(): Promise<CryptoKey> {
        this.secretKey ??= crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(resolveInternalSecret()),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify'],
        );
        return this.secretKey;
    }

    async verifyToken(token: string): Promise<Record<string, unknown> | null> {
        const projectId = CONFIG.GCLOUD.PROJECT_ID;
        if (!projectId) return null;

        try {
            const { payload } = await jwtVerify(token, JWKS, {
                issuer: `https://securetoken.google.com/${projectId}`,
                audience: projectId,
                algorithms: ['RS256'],
            });
            return payload;
        } catch {
            return null;
        }
    }

    async signPayload(payload: Record<string, string>): Promise<string> {
        const encoder = new TextEncoder();
        // Sort keys to ensure consistent string representation
        const sortedKeys = Object.keys(payload).sort();
        const dataToSign = sortedKeys.map((k) => `${k}:${payload[k]}`).join('|');

        const key = await this.hmacKey();
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));

        // Convert to hex string
        return Array.from(new Uint8Array(signatureBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async verifyPayloadSignature(payload: Record<string, string>, signature: string): Promise<boolean> {
        const expectedSignature = await this.signPayload(payload);
        return expectedSignature === signature;
    }

    async getAuthenticatedUser(
        req: Request,
    ): Promise<{ userId: string; tier: 'free' | 'pro'; traceId: string } | null> {
        const userId = req.headers.get('x-user-id');
        const tier = req.headers.get('x-user-tier') as 'free' | 'pro';
        const traceId = req.headers.get('x-trace-id');
        const signature = req.headers.get('x-security-seal');

        if (!userId || !tier || !traceId || !signature) {
            return null;
        }

        const payload = {
            'x-user-id': userId,
            'x-user-tier': tier,
            'x-trace-id': traceId,
        };

        const isValid = await this.verifyPayloadSignature(payload, signature);
        if (!isValid) {
            return null;
        }

        return { userId, tier, traceId };
    }
}
