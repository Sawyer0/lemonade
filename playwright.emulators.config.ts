import { defineConfig, devices } from '@playwright/test';
import { SMOKE_PORT } from './e2e/smoke/globalSetup';

/**
 * Signed-in browser tests against `next start` and the Firebase emulators.
 * The build must be made with NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true and
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-lemonade (see the e2e job in ci.yml),
 * and the run must sit inside `firebase emulators:exec --only auth,firestore`.
 */
export default defineConfig({
    testDir: './e2e/emulators',
    globalSetup: './e2e/emulators/globalSetup.ts',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${SMOKE_PORT}`,
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
