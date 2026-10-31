import { expect, test } from '@playwright/test';

test('plays a generated asset, advances the clock, pauses, and downloads', async ({
  page,
}) => {
  await page.goto('/tts');

  // Wait for the client store to hydrate and resolve the default engine/voice.
  await expect(
    page.getByRole('button', { name: '试听 晴川', exact: true }),
  ).toBeVisible();

  await page.getByRole('textbox', { name: '待合成文本' }).fill('你好');

  const generate = page.getByRole('button', { name: '生成', exact: true });
  await expect(generate).toBeEnabled();
  await generate.click();

  await expect(page.getByText('生成完成')).toBeVisible({ timeout: 15_000 });

  // Decoding finishes after the job succeeds; the stage then reads READY.
  const label = page.getByTestId('player-label');
  await expect(label).toHaveText('READY', { timeout: 15_000 });

  const current = page.getByTestId('player-current');
  await expect(current).toHaveText('00:00');

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(label).toHaveText('PLAYING');
  await expect(current).not.toHaveText('00:00', { timeout: 3_000 });

  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(label).toHaveText('PAUSED');

  const download = page.getByRole('link', { name: '下载 MP3', exact: true });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute('download', /^aural-.+-\d{8}-\d{4}\.mp3$/);
  await expect(download).toHaveAttribute(
    'href',
    /\/api\/v1\/assets\/[^/]+\/audio$/,
  );
});
