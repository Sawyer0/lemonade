import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import path from 'node:path';
import { startNhtsaFixtureServer } from './nhtsaFixtureServer';

/**
 * Starts the production build (`next start`) against the Firebase Auth and
 * Firestore emulators, the offline model provider and the NHTSA fixture server.
 * Run `npm run build` first, and run inside `firebase emulators:exec` (see the
 * smoke job in .github/workflows/ci.yml) or with both emulators already up.
 */
export const SMOKE_PORT = 3100;
const FIXTURE_PORT = 4010;
const PROJECT_ID = 'demo-lemonade';

let server: ChildProcess | undefined;
let fixtures: Server | undefined;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (server?.exitCode !== null && server?.exitCode !== undefined) {
            throw new Error(`next start exited with code ${server.exitCode}`);
        }
        try {
            const res = await fetch(url);
            if (res.status < 500) return;
        } catch {
            // not listening yet
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Server at ${url} did not start within ${timeoutMs} ms`);
}

export async function setup(): Promise<void> {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
    const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
    process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;

    fixtures = await startNhtsaFixtureServer(FIXTURE_PORT);

    const root = path.resolve(__dirname, '../..');
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(SMOKE_PORT)], {
        cwd: root,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: {
            ...process.env,
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
            SECURITY_INTERNAL_SECRET: randomBytes(32).toString('hex'),
            GCLOUD_PROJECT: PROJECT_ID,
            GOOGLE_CLOUD_PROJECT: PROJECT_ID,
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
            FIREBASE_AUTH_EMULATOR_HOST: authHost,
            FIRESTORE_EMULATOR_HOST: firestoreHost,
            LLM_PROVIDER: 'offline',
            NHTSA_API_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}`,
            NHTSA_VPIC_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}/api`,
            UPSTASH_REDIS_REST_URL: '',
            UPSTASH_REDIS_REST_TOKEN: '',
            LANGCHAIN_TRACING_V2: 'false',
        },
    });

    await waitForServer(`http://127.0.0.1:${SMOKE_PORT}/`, 60_000);
}

export async function teardown(): Promise<void> {
    server?.kill('SIGTERM');
    await new Promise<void>((resolve) => fixtures?.close(() => resolve()) ?? resolve());
}
