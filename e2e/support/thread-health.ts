import { expect, type Page } from '@playwright/test';

/**
 * A guest smoke used to stay green when the thread itself said the message
 * failed. The human-check wall is still a valid outcome. An alert inside the
 * thread is not.
 */
export async function assertNoThreadError(page: Page): Promise<void> {
  const thread = page.getByTestId('chat-thread');
  if ((await thread.count()) === 0) return;
  const alert = thread.getByRole('alert');
  const alerts = await alert.count();
  if (alerts > 0) {
    const text = (await alert.first().innerText()).replace(/\s+/g, ' ').trim();
    throw new Error(`The thread reported an error: ${text}`);
  }
  await expect(thread.getByTestId('message-retry')).toHaveCount(0);
}
