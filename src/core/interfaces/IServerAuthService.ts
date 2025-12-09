import { DecodedIdToken } from 'firebase-admin/auth';

/**
 * IServerAuthService - Manages server-side authentication tasks (Admin SDK).
 */
export interface IServerAuthService {
    /**
     * Verify a Firebase ID Token.
     * @param token - The bearer token from the client.
     * @returns The decoded token object.
     */
    verifyToken(token: string): Promise<DecodedIdToken>;
}
