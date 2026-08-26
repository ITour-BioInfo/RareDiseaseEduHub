import { expect, test } from '@playwright/test';

test('English default and compatibility routes render records', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-record-card]')).toHaveCount(175);
  await page.goto('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-record-card]')).toHaveCount(175);
  await page.goto('/rare_disease_education_hub/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-record-card]')).toHaveCount(175);
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const noJsPage = await noJs.newPage();
  await noJsPage.goto('/');
  await expect(noJsPage.locator('[data-record-card]')).toHaveCount(175);
  await noJs.close();
});

test('Certificates and Diplomas is a separate directory', async ({ page }) => {
  await page.goto('/');
  const directoryLink = page.getByRole('link', { name: 'Certificates and Diplomas' });
  await expect(directoryLink).toBeVisible();
  await directoryLink.click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Certificates and Diplomas' }),
  ).toBeVisible();
  await expect(page.locator('.credential-card')).toHaveCount(5);
  await expect(page.locator('[data-record-card]')).toHaveCount(0);
});

test('search, filters, clear, counts and URL state work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('Genomic medicine');
  await expect(page.locator('[data-record-card]:visible')).not.toHaveCount(0);
  await expect(page).toHaveURL(/q=Genomic/);
  await page.locator('select[name="type"]').selectOption('course');
  await expect(page).toHaveURL(/type=course/);
  await expect(page.locator('[data-catalogue-status]')).toContainText(/Showing/);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page).not.toHaveURL(/q=/);
});

test('detail pages, downloads and 404 work', async ({ page }) => {
  await page.goto('/');
  const detail = page.locator('[data-record-card] h3 a').first();
  await detail.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /official source/i }).last()).toHaveAttribute(
    'target',
    '_blank',
  );
  const response = await page.request.get('/rare_disease_education_catalog.json');
  expect(response.ok()).toBe(true);
  expect((await response.json()).length).toBe(180);
  await page.goto('/missing-page/');
  await expect(page.getByText('404')).toBeVisible();
});

test('mobile reflow and keyboard focus remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});
