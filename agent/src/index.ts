import 'reflect-metadata';
import { Elysia } from 'elysia';
import { adminAuth, Logger } from '@lemonade/infrastructure';
import { loadEnv } from './env';
import { issueRoomToken } from './tokens';
import { runWorker } from './worker';

const env = loadEnv();
const logger = new Logger();

/** Token endpoint the mobile app calls before joining a live session room. */
const app = new Elysia().post('/livekit-agent/get-livekit-token', async ({ body, headers, set }) => {
    const { roomName, metadata } = (body ?? {}) as { roomName?: unknown; metadata?: unknown };
    const result = await issueRoomToken(
        { authorization: headers['authorization'], roomName, metadata },
        async (idToken) => (await adminAuth.verifyIdToken(idToken)).uid,
        { apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET },
    );
    set.status = result.status;
    return result.body;
});

app.listen(env.PORT, () => logger.info(`Token server listening on port ${env.PORT}`));

runWorker();

export default app;
