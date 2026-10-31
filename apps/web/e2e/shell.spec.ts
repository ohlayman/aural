import { expect, test } from '@playwright/test';

test('renders zh by default and en under /en', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '文字转语音' })).toBeVisible();
  await page.goto('/en');
  await expect(page.getByRole('link', { name: 'Text to Speech' })).toBeVisible();
});

test('switches locale without a full page reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('link', { name: 'Text to Speech' })).toBeVisible();

  const noReload = await page.evaluate(
    () => (window as unknown as { __noReload?: boolean }).__noReload === true,
  );
  expect(noReload).toBe(true);
});
