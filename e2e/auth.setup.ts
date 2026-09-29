import { expect, test as setup } from '@playwright/test';
import { DEMO_AUTH_STATE } from '../playwright.config';

// Logs in through the demo gate once and hands the cookie to every other
// test, so specs don't each spend one of the 5 login attempts per window.
setup('pass the demo password gate', async ({ page }) => {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('DEMO_PASSWORD must be set to run the E2E tests');

  await page.goto('/demo-login');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter' }).click();

  await page.waitForURL('/');
  // The notebooks page only renders once AuthGate has silently signed the
  // visitor in anonymously and refreshed the server component — no login UI.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  await page.context().storageState({ path: DEMO_AUTH_STATE });
});
