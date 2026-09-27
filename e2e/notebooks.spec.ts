import { expect, test, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Signs a brand-new anonymous visitor in end-to-end: passes the demo gate,
// then waits for AuthGate's silent anonymous sign-in to land — proving
// neither step shows a visible login form for the notebooks page itself.
async function signInFreshVisitor(browser: Browser): Promise<Page> {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('DEMO_PASSWORD must be set to run the E2E tests');

  // The chromium project sets `storageState: DEMO_AUTH_STATE` as a context
  // default, and `browser.newContext()` inherits project-level context
  // options unless overridden — so a bare call here would silently reuse the
  // shared authenticated user's cookies instead of starting blank.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto('/demo-login');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter' }).click();

  await page.waitForURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  return page;
}

function notebookCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: title });
}

// The demo-login rate limit is 5 attempts per 5-minute window (shared across
// this whole suite, since every test hits the same local server). Serial
// order plus reusing the storageState-authenticated `page` fixture for tests
// that don't need a *distinct* anonymous identity keeps the suite well under
// that budget: only the isolation test below mints fresh visitors (2 logins),
// on top of the 1 the setup project already spends and the 1 the demo-gate
// spec's "wrong password" test spends — 4 of the 5-attempt budget, leaving
// headroom for a CI retry.
test.describe.configure({ mode: 'serial' });

test('the notebooks page has no visible login step and passes an accessibility check', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('create, rename and delete a notebook; changes survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Untitled notebook' }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Untitled notebook' }).first()).toBeVisible();

  const card = notebookCard(page, 'Untitled notebook').first();
  await card.getByRole('button', { name: 'Notebook actions' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const renameInput = page.getByRole('dialog').getByRole('textbox');
  await renameInput.fill('Renamed notebook');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('link', { name: 'Renamed notebook' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Untitled notebook' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Renamed notebook' })).toBeVisible();

  const renamedCard = notebookCard(page, 'Renamed notebook').first();
  await renamedCard.getByRole('button', { name: 'Notebook actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByRole('link', { name: 'Renamed notebook' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: 'Renamed notebook' })).toHaveCount(0);
});

test("a second anonymous session does not see the first session's notebooks", async ({
  browser,
}) => {
  const pageA = await signInFreshVisitor(browser);
  await pageA.getByRole('button', { name: 'New notebook' }).click();
  await pageA.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(pageA.getByRole('link', { name: 'Untitled notebook' }).first()).toBeVisible();

  const pageB = await signInFreshVisitor(browser);
  await expect(pageB.getByRole('link', { name: 'Untitled notebook' })).toHaveCount(0);

  await pageA.context().close();
  await pageB.context().close();
});

test('the 6th notebook is refused with a readable message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');

  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'New notebook' }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Untitled notebook' })).toHaveCount(index + 1);
  }

  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText("You've reached the notebook limit for this demo.")).toBeVisible();

  // The dialog stays open on failure so the user can see the error and
  // retry; Radix marks the rest of the page aria-hidden while it's open,
  // so the notebook links aren't queryable by role until it's closed.
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('link', { name: 'Untitled notebook' })).toHaveCount(5);
});
