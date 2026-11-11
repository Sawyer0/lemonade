import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { SMOKE_PORT } from '../smoke/globalSetup';
import { FIXTURE_VIN } from '../smoke/nhtsaFixtureServer';

const BASE = `http://127.0.0.1:${SMOKE_PORT}`;
const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const COMPLAINT = 'Brakes squeal on cold mornings';

interface Seeded {
    email: string;
    password: string;
    vehicleId: string;
    sessionId: string;
}

/** Creates an emulator user with one vehicle and one session through the real API. */
async function seed(): Promise<Seeded> {
    const email = `e2e-${randomUUID()}@example.com`;
    const password = 'e2e-password';
    const signUp = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    expect(signUp.status).toBe(200);
    const { localId, idToken } = (await signUp.json()) as { localId: string; idToken: string };
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${idToken}` };

    const scan = await fetch(`${BASE}/api/vehicles/scan`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vin: FIXTURE_VIN, userId: localId }),
    });
    expect(scan.status).toBe(200);
    const vehicleId = ((await scan.json()) as { data: { id: string } }).data.id;

    const session = await fetch(`${BASE}/api/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vehicleId, complaint: COMPLAINT }),
    });
    expect(session.status).toBe(200);
    const { sessionId } = (await session.json()) as { sessionId: string };

    return { email, password, vehicleId, sessionId };
}

async function signIn(page: Page, user: Seeded): Promise<void> {
    await page.goto('/');
    await page.getByPlaceholder('tech@example.com').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole('button', { name: 'Grant Access' }).click();
    await page.waitForURL('**/garage');
}

test.describe('signed in against the emulators', () => {
    let user: Seeded;

    test.beforeAll(async () => {
        user = await seed();
    });

    test('login form keeps icons beside the inputs and the Google button in the column', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto('/');
        const email = page.getByPlaceholder('tech@example.com');
        await expect(email).toBeVisible();

        const field = await email.boundingBox();
        const icon = await page.locator('svg.lucide-mail').boundingBox();
        expect(field && icon).toBeTruthy();
        // The icon sits wholly to the left of the text box instead of on top of it.
        expect(icon!.x + icon!.width).toBeLessThanOrEqual(field!.x);

        const google = await page.getByRole('button', { name: 'Google' }).boundingBox();
        expect(google!.width).toBeLessThanOrEqual(448 + 1); // max-w-md, not the full 1280 px
    });

    test('garage lists the vehicle under the navbar title', async ({ page }) => {
        const vehicles = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/vehicles');
        await signIn(page, user);
        const res = await vehicles;
        expect(res.status()).toBe(200);
        expect(new URL(res.url()).searchParams.has('userId')).toBe(false);

        await expect(page.getByText('My Garage')).toBeVisible();
        await expect(page.getByRole('heading', { name: /2003 Accord/i })).toBeVisible();
    });

    test('history comes from the API and opens the session from Firestore', async ({ page }) => {
        await signIn(page, user);
        await page
            .getByRole('button', { name: /History/i })
            .first()
            .click();
        await page.waitForURL(`**/garage/${user.vehicleId}/history`);

        await expect(page.getByText('Service History')).toBeVisible();
        await expect(page.getByText(FIXTURE_VIN)).toBeVisible();
        await page.getByText(COMPLAINT).click();

        // The diagnosis screen subscribes to the session doc through the browser SDK.
        await page.waitForURL(`**/session/${user.sessionId}`);
        await expect(page.getByText(`SESSION #${user.sessionId.slice(0, 4)}`, { exact: false })).toBeVisible();
        await expect(page.getByText('Session Not Found')).toHaveCount(0);
    });
});
