import path from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEMO_AUTH_STATE } from '../playwright.config';

const FIXTURES = path.join(__dirname, '..', 'test', 'fixtures');

// Same chunk text the ingestion pipeline produces for sample.pdf — the mock
// embedding model only scores a near-exact match, so the question has to be
// the chunk itself (see e2e/chat.spec.ts).
const SAMPLE_QUESTION =
  'Alpha Report\nThis report shows that the data does grow each year\nThe team notes steady gains in every quarter so far\nMore detail follows in the second part of this note\nReaders should treat these numbers as a rough guide\nA final line keeps this page above the minimum length\n\nBeta Findings\nThis page covers the second half of the same study\nThe numbers here differ from the first page in part\nEach row of the table lists a month and a count\nTaken together the two pages tell a simple story\nA final line keeps this page above the minimum length';

// The prose only: the `[1]` marker is rendered as the citation chip, so the
// sentence's text content is "... mock answer" + the chip + "." and never
// contains the literal "[1]".
const ANSWER_PROSE = 'According to your sources, this is a mock answer';

// The chunk text of slow.pdf, whose marker makes the mock stream an answer of
// about six seconds instead of one and a half — long enough that the stop test
// cannot lose the race between the first token and the click (lib/ai/mock.ts,
// MOCK_SLOW_TRIGGER). Asking the chunk itself is what makes retrieval match it.
const SLOW_QUESTION =
  'Slow Test Source\nThis document exists only to keep an answer streaming\nThe mock-slow-test marker appears here to trigger the long\nreply that is still arriving when a test reaches for Stop\nso that the stop button is never raced against its end\nA final line keeps this page above the minimum length here';

const MOBILE = { width: 390, height: 844 };

/** How far the divider is dragged in the resize test, in either direction. */
const DRAG_BY_PX = 120;

/** One arrow keypress on the divider (`KEYBOARD_STEP_PX` in panel-resizer.tsx). */
const ARROW_STEP_PX = 16;

// Same isolation strategy as the other specs: a fresh anonymous user per test
// via the demo-gate cookie, so notebooks and rate limits never collide.
async function freshUser(browser: Browser, onPage?: (page: Page) => void): Promise<Page> {
  const context = await browser.newContext({ storageState: DEMO_AUTH_STATE });
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(
    cookies.filter((cookie: { name: string }) => cookie.name === 'demo_session'),
  );
  const page = await context.newPage();
  // Before the first navigation, so a caller can listen for page errors from
  // the very first render rather than from wherever the helper happened to stop.
  onPage?.(page);
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

function citationChip(page: Page) {
  return page.getByLabel(/^Citation 1: sample/);
}

/** The invisible divider between the sources column and the chat. */
function panelDivider(page: Page) {
  return page.getByRole('separator', { name: 'Resize sources panel' });
}

/** The width of the sources column, read off the list inside it. */
function sourcesWidth(page: Page): Promise<number> {
  return page
    .getByRole('list', { name: 'Sources' })
    .evaluate((element: HTMLElement) => element.getBoundingClientRect().width);
}

/** Where to put the pointer to grab a control: the middle of its box. */
async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error('The control is not on screen, so it cannot be dragged.');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press on the divider, move `byX` px, release — what a user's drag does. */
async function dragDivider(page: Page, byX: number): Promise<void> {
  const start = await centreOf(panelDivider(page));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + byX, start.y, { steps: 8 });
  await page.mouse.up();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('desktop', () => {
  test('clicking a citation opens the drawer on the quoted passage', async ({ browser }) => {
    // The task's AC is that the upload → ready → ask → cite flow logs nothing,
    // and every assertion below is on the DOM: a page that threw on the way
    // could still show all of it. Collected before the first navigation.
    const pageErrors: string[] = [];
    const page = await freshUser(browser, (fresh) => {
      fresh.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });
      fresh.on('pageerror', (error) => pageErrors.push(error.message));
    });
    await createNotebook(page, 'Citation drawer notebook');
    await addReadySource(page, 'sample.pdf', 'sample');

    await ask(page, SAMPLE_QUESTION);
    await expect(page.getByText(ANSWER_PROSE)).toBeVisible();

    await citationChip(page).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'sample' })).toBeVisible();
    await expect(drawer.getByText('p. 1-2', { exact: true })).toBeVisible();

    // The highlight is a real range inside the chunk, not a decorative box:
    // the marked text has to occur in the paragraph that holds it, and the
    // "couldn't locate the quote" fallback must not be what rendered.
    const highlighted = drawer.locator('mark');
    await expect(highlighted).toBeVisible();
    const markedText = (await highlighted.textContent()) ?? '';
    expect(markedText.length).toBeGreaterThan(0);
    // The highlight is a real range inside the passage, not a box next to it:
    // the marked text has to be part of the paragraph that contains the mark.
    const passageText = await highlighted.evaluate(
      (element) => element.closest('p')?.textContent ?? '',
    );
    expect(passageText).toContain(markedText);
    await expect(drawer.getByText(/Couldn't locate the quoted passage/)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('Escape closes the drawer and returns focus to the citation chip', async ({ browser }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Drawer focus notebook');
    await addReadySource(page, 'sample.pdf', 'sample');

    await ask(page, SAMPLE_QUESTION);
    await expect(page.getByText(ANSWER_PROSE)).toBeVisible();

    const chip = citationChip(page);
    await chip.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    // Assert the close first: while the drawer is open the rest of the page is
    // aria-hidden, so nothing behind it is queryable by role.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(chip).toBeFocused();
  });

  test('unchecking the answering source turns the next answer into the refusal', async ({
    browser,
  }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Selection notebook');
    await addReadySource(page, 'sample.pdf', 'sample');
    await addReadySource(page, 'leak.pdf', 'leak');

    // Both ready sources start selected — that is the untouched default.
    await expect(page.getByText('2 of 2 sources used in chat')).toBeVisible();

    // Base UI's checkbox is a button with role=checkbox, hence click() rather
    // than uncheck() — the native input it renders alongside is aria-hidden.
    const sampleCheckbox = page.getByRole('checkbox', { name: 'Use sample in chat' });
    await expect(sampleCheckbox).toBeChecked();
    await sampleCheckbox.click();
    await expect(sampleCheckbox).not.toBeChecked();
    await expect(page.getByText('1 of 2 sources used in chat')).toBeVisible();

    // sample.pdf is now out of the answer's reach, so its content is no longer
    // in the sources at all and the grounded refusal is the correct answer.
    await ask(page, SAMPLE_QUESTION);
    await expect(page.getByText("I couldn't find this in your sources.")).toBeVisible();
    await expect(page.getByLabel(/^Citation/)).toHaveCount(0);

    await sampleCheckbox.click();
    await expect(sampleCheckbox).toBeChecked();
    await expect(page.getByText('2 of 2 sources used in chat')).toBeVisible();

    await ask(page, SAMPLE_QUESTION);
    await expect(page.getByText(ANSWER_PROSE)).toBeVisible();
    await expect(citationChip(page)).toBeVisible();
  });

  test('the composer refuses to send with no source selected', async ({ browser }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Empty selection notebook');
    await addReadySource(page, 'sample.pdf', 'sample');

    const checkbox = page.getByRole('checkbox', { name: 'Use sample in chat' });
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();

    await expect(page.getByText('No sources selected — the chat is paused')).toBeVisible();
    await expect(page.getByPlaceholder('Select a source to chat')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  test('stop aborts a streaming answer and re-enables the input', async ({ browser }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Stop notebook');
    await addReadySource(page, 'slow.pdf', 'slow');

    // slow.pdf asks for the mock's long answer: a token every 150ms for about
    // six seconds, so the stream cannot have ended by the time Stop is clicked.
    await ask(page, SLOW_QUESTION);

    // Wait for real partial text before reaching for Stop: the button appears as
    // soon as the first chunk lands, and only once prose is on screen does
    // "partial answer kept" become an assertion instead of a hope.
    const partialAnswer = page.getByText(/According/);
    await expect(partialAnswer).toBeVisible({ timeout: 30_000 });

    const stop = page.getByRole('button', { name: 'Stop' });
    await expect(stop).toBeVisible();
    await stop.click();

    await expect(stop).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Assistant is thinking' })).toHaveCount(0);
    // "Usable again" means it accepts the next question. Send only turns on for
    // non-empty input, so the composer has to be typed into rather than merely
    // checked for a disabled attribute.
    const composer = page.getByPlaceholder('Ask a question about your sources...');
    await expect(composer).toBeEnabled();
    await composer.fill('A follow-up question');
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
    // Whatever had streamed before the abort stays on screen — an abort must
    // not clear the transcript or leave a stuck error.
    await expect(partialAnswer).toBeVisible();
    await expect(page.getByText(SLOW_QUESTION)).toBeVisible();
    await expect(page.getByText('Something went wrong. Please try again.')).toHaveCount(0);
  });

  test('renaming the title in the header survives a reload', async ({ browser }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Rename me');

    await page.getByRole('button', { name: 'Rename notebook' }).click();
    await page.getByLabel('Notebook title').fill('Renamed in the workspace');
    await page.getByRole('button', { name: 'Save title' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Renamed in the workspace');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Renamed in the workspace');
    // The home page's card is the same fact, so it has to agree after a reload.
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Renamed in the workspace' })).toBeVisible();
  });

  test('the divider resizes the sources column, by drag and by keyboard, within limits', async ({
    browser,
  }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Resizable split');
    await addReadySource(page, 'sample.pdf', 'sample');

    const divider = panelDivider(page);
    await expect(divider).toBeVisible();
    const minimum = Number(await divider.getAttribute('aria-valuemin'));
    const maximum = Number(await divider.getAttribute('aria-valuemax'));
    // The other half of the split has a floor of its own, and the two do not
    // touch: this is a real range, not a fixed width with a handle drawn on it.
    expect(maximum).toBeGreaterThan(minimum + 100);

    const start = await sourcesWidth(page);
    await dragDivider(page, DRAG_BY_PX);
    // The column is written as a px track, so the widening is exactly the
    // distance the pointer travelled, up to the browser's sub-pixel rounding.
    await expect.poll(() => sourcesWidth(page)).toBeCloseTo(start + DRAG_BY_PX, 0);

    // The same control without a mouse.
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => sourcesWidth(page)).toBeCloseTo(start + DRAG_BY_PX + ARROW_STEP_PX, 0);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => sourcesWidth(page)).toBeCloseTo(start + DRAG_BY_PX - ARROW_STEP_PX, 0);

    // Neither side can be squeezed away. The over-drag is measured against the
    // range the divider itself reports, so it stays on screen at any viewport.
    await dragDivider(page, maximum);
    await expect(divider).toHaveAttribute('aria-valuenow', String(maximum));
    await dragDivider(page, -maximum);
    await expect(divider).toHaveAttribute('aria-valuenow', String(minimum));
  });

  test('the notebook page has no accessibility violations, in both themes', async ({ browser }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Axe notebook');
    await addReadySource(page, 'sample.pdf', 'sample');

    await expectNoAxeViolations(page);

    // Drive dark mode through the real control rather than emulateMedia, so
    // the pass covers what the toggle actually produces.
    const toggle = page.getByRole('button', { name: /Switch to .* theme/ });
    await toggle.click();
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await expectNoAxeViolations(page);
  });
});

test.describe('mobile', () => {
  test('the panels become tabs, stay overflow-free and keep a streaming answer', async ({
    browser,
  }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Mobile notebook');

    await page.setViewportSize(MOBILE);
    await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();

    // No horizontal overflow at 390px.
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    // Sources live behind their own tab, which is where the upload control is.
    await page.getByRole('tab', { name: 'Sources' }).click();
    await addReadySource(page, 'sample.pdf', 'sample');
    await page.getByRole('tab', { name: 'Chat' }).click();

    await ask(page, SAMPLE_QUESTION);
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

    // Switching away and back must not unmount the chat: the answer that is
    // still streaming has to survive the round trip (`keepMounted` guard).
    await page.getByRole('tab', { name: 'Sources' }).click();
    await expect(page.getByRole('tab', { name: 'Sources' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');

    await expect(page.getByText(ANSWER_PROSE)).toBeVisible({ timeout: 30_000 });
    await expect(citationChip(page)).toBeVisible();
  });

  test('the notebook page has no accessibility violations at 390px, in both themes', async ({
    browser,
  }) => {
    const page = await freshUser(browser);
    await createNotebook(page, 'Mobile axe notebook');

    await page.setViewportSize(MOBILE);
    await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();

    await expectNoAxeViolations(page);

    const toggle = page.getByRole('button', { name: /Switch to .* theme/ });
    await toggle.click();
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await expectNoAxeViolations(page);
  });
});

test('the theme toggle switches the theme app-wide and survives navigation and reload', async ({
  browser,
}) => {
  const page = await freshUser(browser);

  // Default is "follow the system"; Playwright's default colour scheme is
  // light, so the page starts in light mode with no stored choice.
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  const toggle = page.getByRole('button', { name: /Switch to .* theme/ });
  await toggle.click();
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await createNotebook(page, 'Dark notebook');
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  // The home page is a different route but the same app-wide choice.
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
});
