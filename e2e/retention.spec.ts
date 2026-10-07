import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// T08b: the retention notice (banner + footer), the daily activity touch, and
// the cron route's access rules. Uses the shared signed-in visitor from the
// setup project — no extra demo logins (the login rate limit is shared).

test('the banner shows the retention period on the first visit and stays dismissed', async ({
  page,
}): Promise<void> => {
  await page.goto('/');

  const banner = page.getByRole('region', { name: 'How your data is kept' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('deleted after 30 days without a visit');
  await expect(page.getByRole('contentinfo')).toContainText('deleted after 30 days');
  // The banner and footer come from the layout and can render before the page's
  // own content has streamed in; scanning then reports a missing h1.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await banner.getByRole('button', { name: 'Dismiss notice' }).click();
  await expect(banner).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'How your data is kept' })).toBeHidden();
  await expect(page.getByRole('contentinfo')).toContainText('deleted after 30 days');
});

test('the login page shows neither the banner nor the footer', async ({
  browser,
}): Promise<void> => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto('/demo-login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'How your data is kept' })).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await context.close();
});

test('a visit records activity once a day via the last-seen cookie', async ({
  page,
  context,
}): Promise<void> => {
  await context.clearCookies({ name: 'last_seen_touch' });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const cookies = await context.cookies();
  const touch = cookies.find((cookie) => cookie.name === 'last_seen_touch');
  expect(touch).toBeDefined();
  expect(touch?.httpOnly).toBe(true);
});

test('the cron route needs its bearer token, not the demo cookie', async ({
  playwright,
  baseURL,
}): Promise<void> => {
  const request = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });

  const withoutToken = await request.get('/api/cron/retention', { maxRedirects: 0 });
  expect(withoutToken.status()).toBe(401);

  const wrongToken = await request.get('/api/cron/retention', {
    headers: { authorization: 'Bearer not-the-secret' },
    maxRedirects: 0,
  });
  expect(wrongToken.status()).toBe(401);

  await request.dispose();
});
