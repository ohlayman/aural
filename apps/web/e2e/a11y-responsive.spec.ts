import { expect, test, type Page } from '@playwright/test';

const TTS_WIDTHS = [390, 768, 1024, 1440];
const HYDRATION_TIMEOUT = 15_000;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

/** Waits for the TTS store to hydrate and resolve its default voice. */
async function waitForTtsReady(page: Page) {
  await expect(
    page.getByRole('button', { name: '试听 晴川', exact: true }),
  ).toBeVisible({ timeout: HYDRATION_TIMEOUT });
}

for (const width of TTS_WIDTHS) {
  test(`/tts has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/tts');
    await waitForTtsReady(page);
    await expectNoHorizontalScroll(page);
  });
}

for (const width of [390, 1440]) {
  test(`/ has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test('keyboard can generate and play: ⌘/Ctrl+Enter then Space', async ({
  page,
}) => {
  await page.goto('/tts');
  await waitForTtsReady(page);

  const textarea = page.getByRole('textbox', { name: '待合成文本' });
  await textarea.focus();
  await page.keyboard.type('你好');

  const generate = page.getByRole('button', { name: '生成', exact: true });
  await expect(generate).toBeEnabled();

  await page.keyboard.press('Control+Enter');

  const play = page.getByRole('button', { name: '播放', exact: true });
  await expect(play).toBeEnabled({ timeout: HYDRATION_TIMEOUT });

  const label = page.getByTestId('player-label');
  await play.focus();
  await page.keyboard.press('Space');
  await expect(label).toHaveText('PLAYING');

  await page.keyboard.press('Space');
  await expect(label).toHaveText('PAUSED');
});

test('Meta+Enter also submits the current text', async ({ page }) => {
  await page.goto('/tts');
  await waitForTtsReady(page);

  const textarea = page.getByRole('textbox', { name: '待合成文本' });
  await textarea.focus();
  await page.keyboard.type('你好');
  await expect(
    page.getByRole('button', { name: '生成', exact: true }),
  ).toBeEnabled();

  await page.keyboard.press('Meta+Enter');

  // The status panel only mounts once a job id exists.
  await expect(page.getByText(/排队中|正在合成|生成完成/).first()).toBeVisible({
    timeout: HYDRATION_TIMEOUT,
  });
});

test('mobile menu exposes navigation and closes after following a link', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const menu = page.getByRole('button', { name: '菜单' });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  const box = await menu.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');

  const ttsLink = page.getByRole('link', { name: '文字转语音' });
  await expect(ttsLink).toBeVisible();
  await ttsLink.click();

  await expect(page).toHaveURL(/\/(en\/)?tts$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('reduced motion keeps the home page usable and overflow-free', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('#gl')).toBeVisible();
  await expect(page.getByText('输入文字，按 Enter 朗读')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
