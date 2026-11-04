import { fileURLToPath } from 'node:url';
import { cli, ServerOptions } from '@livekit/agents';
import { loadEnv } from './env';

/**
 * Starts the LiveKit agent worker on its own (no token server). Run with the
 * LiveKit CLI verbs, e.g. `tsx src/worker.ts dev` or `tsx src/worker.ts start`.
 */
export function runWorker(): void {
    const env = loadEnv();
    cli.runApp(
        new ServerOptions({
            agent: fileURLToPath(new URL('./livekit-agent.ts', import.meta.url)),
            wsURL: env.LIVEKIT_URL,
            apiKey: env.LIVEKIT_API_KEY,
            apiSecret: env.LIVEKIT_API_SECRET,
        }),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runWorker();
