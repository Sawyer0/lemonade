import { Elysia } from 'elysia';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env } from './env';
import { LiveKitMasterTechAgent } from './livekit-agent';
import { AiApiClient } from './ai-api-client';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const app = new Elysia();

// LiveKit Room Service Client
const roomService = new RoomServiceClient(env.LIVEKIT_HOST, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

// Instantiate the AiApiClient
const aiApiClient = new AiApiClient({
    baseUrl: env.MAIN_APP_BASE_URL,
    apiKey: env.MAIN_APP_API_KEY,
});

// Instantiate the LiveKit Master Tech Agent with the real AI client
const masterTechAgent = new LiveKitMasterTechAgent({
    liveStreamAnalyzer: aiApiClient,
    chatAssistantAI: aiApiClient,
});

app.post('/livekit-agent/get-livekit-token', async ({ body, set, headers }) => {
    const { roomName } = body as { roomName: string; metadata?: string };
    const authHeader = headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        set.status = 401;
        return { error: 'Missing or invalid Authorization header' };
    }

    const idToken = authHeader.split('Bearer ')[1];
    let uid: string;

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        set.status = 401;
        return { error: 'Invalid authentication token' };
    }

    if (!roomName) {
        set.status = 400;
        return { error: 'Missing roomName' };
    }

    // Use verified UID as participant identity
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: uid,
        name: uid, // Or fetch user display name if available/needed
        metadata: (body as any).metadata, // Pass through metadata from client
    });
    at.addGrant({ roomJoin: true, room: roomName });

    try {
        const token = await at.toJwt();
        return { token };
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        set.status = 500;
        return { error: 'Failed to generate LiveKit token' };
    }
});

app.listen(env.PORT || 3001, () => {
    console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
    masterTechAgent.start(); // Start the agent when the server is ready
});

export default app;