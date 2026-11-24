import { expect, test } from '@playwright/test';

import { APP } from './support/app-copy';
import { collectPageErrors, expectNoPageErrors } from './support/page-errors';
import { assertNoThreadError } from './support/thread-health';

/**
 * Read-only shell of the Solana shopper at sol.changuito.me.
 *
 * It does not type, it does not start a turn, and it does not open checkout.
 * A human-check wall is a pass. An error inside the thread is not.
 */
test.describe('app shell', () => {
  test('shows the masthead and either the composer or the human check', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Changuito' })).toBeVisible();
    await expect(page.getByRole('button', { name: APP.loginAction })).toBeVisible();

    const composer = page.getByTestId('composer');
    const verification = page.getByTestId('human-gate');
    await expect(composer.or(verification)).toBeVisible({ timeout: 30_000 });
    await assertNoThreadError(page);
    expectNoPageErrors(errors);
  });
});
