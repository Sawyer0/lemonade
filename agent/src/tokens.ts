import { AccessToken } from 'livekit-server-sdk';

/** Verifies a Firebase ID token and returns the user's uid. */
export type IdTokenVerifier = (idToken: string) => Promise<string>;

export interface TokenRequest {
    authorization?: string | null;
    roomName?: unknown;
    metadata?: unknown;
}

export type TokenResult = { status: 200; body: { token: string } } | { status: 400 | 401; body: { error: string } };

export interface LiveKitCredentials {
    apiKey: string;
    apiSecret: string;
}

/**
 * Issues a LiveKit room token for a signed-in user. The participant identity
 * is the verified Firebase uid, never a value the client chose.
 */
export async function issueRoomToken(
    request: TokenRequest,
    verify: IdTokenVerifier,
    credentials: LiveKitCredentials,
): Promise<TokenResult> {
    const idToken = request.authorization?.startsWith('Bearer ') ? request.authorization.slice(7) : undefined;
    if (!idToken) return { status: 401, body: { error: 'Missing or invalid Authorization header' } };

    let uid: string;
    try {
        uid = await verify(idToken);
    } catch {
        return { status: 401, body: { error: 'Invalid authentication token' } };
    }

    if (typeof request.roomName !== 'string' || request.roomName.length === 0) {
        return { status: 400, body: { error: 'Missing roomName' } };
    }

    const token = new AccessToken(credentials.apiKey, credentials.apiSecret, {
        identity: uid,
        name: uid,
        metadata: typeof request.metadata === 'string' ? request.metadata : undefined,
    });
    token.addGrant({ roomJoin: true, room: request.roomName, canPublishData: true });
    return { status: 200, body: { token: await token.toJwt() } };
}
