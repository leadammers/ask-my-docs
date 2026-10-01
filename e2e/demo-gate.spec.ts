import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// No gate cookie: these tests are the visitor who has no access code.
test.use({ storageState: { cookies: [], origins: [] } });

test('unauthenticated visit redirects to an accessible login page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/demo-login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enter your access code');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('wrong code shows an error and sets no cookie', async ({ page, context }) => {
  await page.goto('/demo-login');
  await page.getByLabel('Access code').fill('AMD-WRNG-WRNG-WRNG-WRNG-WRNG-WRNG-WR');
  await page.getByRole('button', { name: 'Enter' }).click();

  await expect(page).toHaveURL('/demo-login?error=1');
  await expect(page.getByText('That code is invalid or has expired.')).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'demo_session')).toBeUndefined();
});
