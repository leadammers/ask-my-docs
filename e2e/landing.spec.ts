import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing page renders with no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ask-my-docs');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
