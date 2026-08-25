import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const path of [
  '/',
  '/en/',
  '/metodologiya/',
  '/resursi/embl-ebi-training-methods-in-genomic-variant-calling/',
]) {
  test(`has no serious or critical axe violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact || ''),
      ),
    ).toEqual([]);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', /^(bg|en)$/);
  });
}
