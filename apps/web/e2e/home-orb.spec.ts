import { expect, test } from '@playwright/test';

test('renders the home orb, hero heading and voice capsule', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#gl')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /当前音色/ })).toContainText('晴川');
  await expect(page.getByText('输入文字，按 Enter 朗读')).toBeVisible();
});

test('shows the English hint under /en', async ({ page }) => {
  await page.goto('/en');

  await expect(page.getByText('Type text, press Enter to speak')).toBeVisible();
});
