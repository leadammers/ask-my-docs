import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEMO_AUTH_STATE } from '../playwright.config';
import { entitleSession } from './entitle';

const FIXTURES = path.join(__dirname, '..', 'test', 'fixtures');

// A fresh anonymous user per test, without spending a demo-login attempt:
// keep only the demo-gate cookie from the setup state, drop the Supabase
// session, and AuthGate signs a brand-new anonymous user in. Own user =
// no interference with notebooks.spec.ts (which drains the shared user's
// notebooks) and a clean per-notebook source count. The new user needs the
// demo entitlement too, or every write below is refused (e2e/entitle.ts).
async function freshUser(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: DEMO_AUTH_STATE });
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(
    cookies.filter((cookie: { name: string }) => cookie.name === 'demo_session'),
  );
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your notebooks');
  await entitleSession(context);
  return page;
}

async function createNotebook(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByPlaceholder('Notebook title').fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
}

function sourceItem(page: Page, title: string) {
  return page.getByRole('list', { name: 'Sources' }).getByRole('listitem').filter({
    hasText: title,
  });
}

test('a text PDF becomes ready, and can be deleted with its notebook', async ({ browser }) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'PDF notebook');
  await expect(page.getByText(/sent to Google Gemini/)).toBeVisible();

  await page.getByLabel('Upload PDF').setInputFiles(path.join(FIXTURES, 'sample.pdf'));

  const item = sourceItem(page, 'sample');
  // Pending/Processing is too short-lived to assert: with the AI mocked, ingest can
  // finish before the list first renders, so the item appears already Ready.
  await expect(item.getByText('Ready')).toBeVisible({ timeout: 30_000 });
  await expect(item.getByText('2 pages')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await item.getByRole('button', { name: 'Delete sample' }).click();
  await expect(item).toHaveCount(0);
  await expect(page.getByText('No sources yet. Add a PDF to get started.')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Notebook actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('link', { name: 'PDF notebook' })).toHaveCount(0);
});

test('an image-only PDF fails with the scanned message and the notebook keeps working', async ({
  browser,
}) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'Scanned notebook');

  await page.getByLabel('Upload PDF').setInputFiles(path.join(FIXTURES, 'scanned.pdf'));

  const scanned = sourceItem(page, 'scanned');
  await expect(scanned.getByText('Failed')).toBeVisible({ timeout: 30_000 });
  await expect(scanned.getByText(/no extractable text \(scanned\?\)/)).toBeVisible();
  await expect(scanned.getByRole('button', { name: 'Retry' })).toBeVisible();

  await page.getByLabel('Upload PDF').setInputFiles(path.join(FIXTURES, 'sample.pdf'));
  await expect(sourceItem(page, 'sample').getByText('Ready')).toBeVisible({ timeout: 30_000 });
});

test('an oversized file is rejected before upload', async ({ browser }) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'Big file notebook');

  await page.getByLabel('Upload PDF').setInputFiles({
    name: 'huge.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(15 * 1024 * 1024, 0x20),
  });

  await expect(page.getByText('That file is too large for this demo.')).toBeVisible();
  await expect(page.getByText('No sources yet. Add a PDF to get started.')).toBeVisible();
});

test("another user can't start ingest on your source", async ({ browser }) => {
  const owner = await freshUser(browser);
  await createNotebook(owner, 'Private notebook');

  const ingestRequest = owner.waitForRequest(/\/api\/sources\/[^/]+\/ingest$/);
  await owner.getByLabel('Upload PDF').setInputFiles(path.join(FIXTURES, 'sample.pdf'));
  const ingestUrl = (await ingestRequest).url();

  const intruder = await freshUser(browser);
  const response = await intruder.request.post(ingestUrl);
  expect(response.status()).toBe(404);
});
