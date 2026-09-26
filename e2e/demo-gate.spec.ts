import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// No gate cookie: these tests are the visitor who doesn't know the password.
test.use({ storageState: { cookies: [], origins: [] } });

test('unauthenticated visit redirects to an accessible login page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/demo-login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Enter the demo password');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('wrong password shows an error and sets no cookie', async ({ page, context }) => {
  await page.goto('/demo-login');
  await page.getByLabel('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Enter' }).click();

  await expect(page).toHaveURL('/demo-login?error=1');
  await expect(page.getByText("That password isn't correct.")).toBeVisible();

  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'demo_session')).toBeUndefined();
});
