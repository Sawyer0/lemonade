import { test, expect } from '@playwright/test';

test('Landing page loads and shows sign in button', async ({ page }) => {
    // 1. Go to homepage
    await page.goto('/');

    // 2. Verify Title
    await expect(page.getByText('LEMONADE')).toBeVisible();
    await expect(page.getByText('Master Technician')).toBeVisible();

    // 3. Verify Sign In Button
    const signInButton = page.getByRole('button', { name: 'Google' });
    await expect(signInButton).toBeVisible();

    // 4. Verify clicking it (mocking auth is out of scope for this MVP test, but we can check it exists)
    // We won't click it to avoid opening a popup that might flake.
});

test('Keyboard focus shows a visible brand-orange ring', async ({ page }) => {
    // 1. Go to homepage
    await page.goto('/');

    // 2. Find the sign-in button
    const signInButton = page.getByRole('button', { name: 'Google' });
    await expect(signInButton).toBeVisible();

    // 3. Tab through the page until the sign-in button receives keyboard focus
    for (let tab = 0; tab < 20; tab++) {
        if (await signInButton.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
    }
    await expect(signInButton).toBeFocused();

    // 4. The focused button must show a solid, non-zero, brand-orange outline
    const outline = await signInButton.evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    expect(outline.style).toBe('solid');
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
    expect(outline.color).toBe('rgb(255, 154, 77)');
});
