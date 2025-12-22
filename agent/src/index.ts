import "reflect-metadata"; // Required for InversifyJS decorators
import { Elysia } from 'elysia';
import { AccessToken } from 'livekit-server-sdk';
import { env } from './env';
import LiveKitMasterTechAgent from './livekit-agent'; // default export of defineAgent
import admin from 'firebase-admin';
import { ILogger } from '@lemonade/core';
import { 
    EnvConfigProvider, 
    Logger, 
} from '@lemonade/infrastructure';

// Initialize Firebase Admin (The 'adminDb' import in repositories will trigger initialization in 'infrastructure/src/firebase/admin.ts'.)
// We rely on 'infrastructure/src/firebase/admin.ts' to handle the 'initializeApp' with proper credentials.

const app = new Elysia();

// --- Dependency Injection Wiring (Manual for Agent) ---
const config = new EnvConfigProvider();
const logger = new Logger(); // Remote transport optional

// The agent is now defined using defineAgent in livekit-agent.ts

app.post('/livekit-agent/get-livekit-token', async ({ body, set, headers }) => {
    const { roomName, metadata: bodyMetadata } = body as { roomName: string; metadata?: string };
    const authHeader = headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        set.status = 401;
        return { error: 'Missing or invalid Authorization header' };
    }

    const idToken = authHeader.split('Bearer ')[1];
    let uid: string;

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken); // Uses firebase-admin init
        uid = decodedToken.uid;
    } catch (error) {
        logger.error('Error verifying Firebase ID token:', error as Error);
        set.status = 401;
        return { error: 'Invalid authentication token' };
    }

    if (!roomName) {
        set.status = 400;
        return { error: 'Missing roomName' };
    }

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: uid,
        name: uid,
        metadata: bodyMetadata,
    });
    at.addGrant({ roomJoin: true, room: roomName });

    try {
        const token = await at.toJwt();
        return { token };
    } catch (error) {
        logger.error('Error generating LiveKit token:', error as Error);
        set.status = 500;
        return { error: 'Failed to generate LiveKit token' };
    }
});

app.listen(env.PORT || 3001, () => {
    logger.info(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
    // No explicit masterTechAgent.start() call here; defineAgent handles it
});

export default app;