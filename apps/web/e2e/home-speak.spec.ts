import { expect, test } from '@playwright/test';

test('typing text and pressing Enter speaks through a real tts job', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: '或者，输入文字' }).click();
  await page.getByRole('textbox', { name: '输入文字生成语音' }).fill('你好');
  await page.keyboard.press('Enter');

  await expect(page.getByText(/正在朗读/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/按住|输入文字/)).toBeVisible({ timeout: 10_000 });
});

test('speaks typed text under the English locale', async ({ page }) => {
  await page.goto('/en');

  await page.getByRole('button', { name: 'Or type text' }).click();
  await page
    .getByRole('textbox', { name: 'Type text to generate speech' })
    .fill('Hello');
  await page.keyboard.press('Enter');

  await expect(page.getByText(/Speaking/)).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText('Type text, press Enter to speak'),
  ).toBeVisible({ timeout: 10_000 });
});
