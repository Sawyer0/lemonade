export interface IEdgeSecurityService {
    /**
     * Verifies a Firebase ID token at the Edge.
     * Returns the payload if valid, null otherwise.
     */
    verifyToken(token: string): Promise<any>;

    /**
     * Signs data with HMAC for internal integrity.
     * Used to seal headers injected by middleware.
     */
    signPayload(payload: Record<string, string>): Promise<string>;

    /**
     * Verifies HMAC signature of a payload.
     */
    verifyPayloadSignature(payload: Record<string, string>, signature: string): Promise<boolean>;

    /**
     * High-level utility for API routes to verify middleware-injected headers.
     * Re-calculates and verifies the HMAC seal.
     */
    getAuthenticatedUser(req: Request): Promise<{ userId: string; tier: 'free' | 'pro'; traceId: string } | null>;
}
