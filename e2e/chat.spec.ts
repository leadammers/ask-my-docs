import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { DEMO_AUTH_STATE } from '../playwright.config';

const FIXTURES = path.join(__dirname, '..', 'test', 'fixtures');

// The mock chat/embedding models (lib/ai/mock.ts) only give a high vector
// score for a question that exactly matches an ingested chunk's content, so
// these questions are the real chunk text produced by the ingestion
// pipeline for sample.pdf / leak.pdf, not hand-written prose.
const SAMPLE_QUESTION =
  'Alpha Report\nThis report shows that the data does grow each year\nThe team notes steady gains in every quarter so far\nMore detail follows in the second part of this note\nReaders should treat these numbers as a rough guide\nA final line keeps this page above the minimum length\n\nBeta Findings\nThis page covers the second half of the same study\nThe numbers here differ from the first page in part\nEach row of the table lists a month and a count\nTaken together the two pages tell a simple story\nA final line keeps this page above the minimum length';

const LEAK_QUESTION =
  'Leak Test Source\nThis document exists only to test citation rendering safety\nThe mock-leak-test marker appears here to trigger a scripted\nreply that tries to leak data through a markdown image link\nThe client must never render that image or fetch its target\nA final line keeps this page above the minimum length here';

const UNRELATED_QUESTION = 'What is the capital of a country not mentioned anywhere in this test?';

// Same isolation strategy as e2e/sources.spec.ts: a fresh anonymous user per
// test via the demo-gate cookie, so notebooks and rate limits never collide.
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
  return page;
}

async function createNotebook(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'New notebook' }).click();
  await page.getByPlaceholder('Notebook title').fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
}

async function addReadySource(page: Page, fixture: string, itemTitle: string): Promise<void> {
  await page.getByLabel('Upload PDF').setInputFiles(path.join(FIXTURES, fixture));
  const item = page
    .getByRole('list', { name: 'Sources' })
    .getByRole('listitem')
    .filter({ hasText: itemTitle });
  await expect(item.getByText('Ready')).toBeVisible({ timeout: 30_000 });
}

async function ask(page: Page, question: string): Promise<void> {
  await page.getByPlaceholder('Ask a question about your sources...').fill(question);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('a question grounded in a source streams an answer with a citation chip', async ({
  browser,
}) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'Citation notebook');
  await addReadySource(page, 'sample.pdf', 'sample');

  await ask(page, SAMPLE_QUESTION);

  await expect(page.getByText('According to your sources, this is a mock answer')).toBeVisible();
  const citationChip = page.getByLabel(/^Citation 1: sample/);
  await expect(citationChip).toBeVisible();
  await citationChip.hover();
  await expect(page.getByText('sample, p. 1-2', { exact: true })).toBeVisible();
});

test('a malicious markdown image in the answer never renders or fires a request', async ({
  browser,
}) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'Leak notebook');
  await addReadySource(page, 'leak.pdf', 'leak');

  const leakRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.com')) leakRequests.push(request.url());
  });

  await ask(page, LEAK_QUESTION);

  await expect(page.getByText('Here is what your source says')).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  expect(leakRequests).toEqual([]);
});

test('an unrelated question gets the fixed fallback without calling the model', async ({
  browser,
}) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'Fallback notebook');
  await addReadySource(page, 'sample.pdf', 'sample');

  await ask(page, UNRELATED_QUESTION);

  await expect(page.getByText("I couldn't find this in your sources.")).toBeVisible();
  await expect(page.getByLabel(/^Citation/)).toHaveCount(0);
});

test('a typing indicator covers the wait before the first answer token', async ({ browser }) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'Typing indicator notebook');
  await addReadySource(page, 'sample.pdf', 'sample');

  // Hold the request open so the pending window is observable; the mock stream
  // otherwise finishes before the assertion can run.
  await page.route('**/api/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await ask(page, SAMPLE_QUESTION);

  const indicator = page.getByRole('status', { name: 'Assistant is thinking' });
  await expect(indicator).toBeVisible();
  await expect(page.getByText('According to your sources, this is a mock answer')).toBeVisible();
  await expect(indicator).toHaveCount(0);
});

test('chat history and citations survive a page reload', async ({ browser }) => {
  const page = await freshUser(browser);
  await createNotebook(page, 'History notebook');
  await addReadySource(page, 'sample.pdf', 'sample');

  await ask(page, SAMPLE_QUESTION);
  await expect(page.getByText('According to your sources, this is a mock answer')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Alpha Report')).toBeVisible();
  await expect(page.getByText('According to your sources, this is a mock answer')).toBeVisible();
  await expect(page.getByLabel(/^Citation 1: sample/)).toBeVisible();
});
