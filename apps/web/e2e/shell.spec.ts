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

test('persists the English choice through NEXT_LOCALE on root visits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en$/);

  const localeCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'NEXT_LOCALE',
  );
  expect(localeCookie?.value).toBe('en');

  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('link', { name: 'Text to Speech' })).toBeVisible();
});
