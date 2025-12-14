import { DecodedIdToken } from 'firebase-admin/auth';
export interface IServerAuthService {
    /**
     * @param token - The bearer token from the client.
     * @returns The decoded token object.
     */
    verifyToken(token: string): Promise<DecodedIdToken>;
}
