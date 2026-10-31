import { expect, test } from '@playwright/test';

test('generates a tts job and re-enables the generate button', async ({
  page,
}) => {
  await page.goto('/tts');

  // Wait for the client store to hydrate and resolve the default engine/voice;
  // filling before hydration would be overwritten by the persisted defaults.
  await expect(
    page.getByRole('button', { name: '试听 晴川', exact: true }),
  ).toBeVisible();

  await page.getByRole('textbox', { name: '待合成文本' }).fill('你好');

  const generate = page.getByRole('button', { name: '生成', exact: true });
  await expect(generate).toBeEnabled();

  await generate.click();

  await expect(page.getByText('生成完成')).toBeVisible({ timeout: 15_000 });
  await expect(generate).toBeEnabled();
});
