import { test, expect } from '@playwright/test';

test('Landing page loads and shows sign in button', async ({ page }) => {
    // 1. Go to homepage
    await page.goto('/');

    // 2. Verify Title
    await expect(page.getByText('LEMONADE')).toBeVisible();
    await expect(page.getByText('AI-POWERED MASTER TECHNICIAN')).toBeVisible();

    // 3. Verify Sign In Button
    const signInButton = page.getByRole('button', { name: /Sign In with Google/i });
    await expect(signInButton).toBeVisible();

    // 4. Verify clicking it (mocking auth is out of scope for this MVP test, but we can check it exists)
    // We won't click it to avoid opening a popup that might flake.
});
