import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../e2e/fixtures';

const output = fileURLToPath(new URL('../../../docs/readme/images/', import.meta.url));

// Real application screens, isolated API fixtures. No live accounts or orders.
test('capture storefront and purchase screens for README', async ({ page, scenario }, testInfo) => {
  await mkdir(output, { recursive: true });
  const mobile = testInfo.project.name === 'mobile';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const capture = async (name: string, fullPage = false) => {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.loading-spinner')).toHaveCount(0);
    await page.screenshot({ path: `${output}${name}.png`, fullPage, animations: 'disabled' });
  };

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gói Ấm Trao Em', exact: true })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(2);
  await capture(mobile ? 'mobile-home' : 'desktop-home');
  if (!mobile) {
    await page.locator('#catalog').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#catalog').screenshot({
      path: `${output}desktop-catalog.png`, animations: 'disabled',
      // Keep the standalone catalog crop free of the fixed page-level launcher.
      style: '.chat-launcher { visibility: hidden !important; }',
    });
    await page.goto('/login');
    await expect(page.locator('main form')).toBeVisible();
    await capture('desktop-login');
  }

  await scenario.cart();
  await page.goto('/cart');
  await expect(page.locator('.cart-item-card')).toHaveCount(1);
  if (mobile) await capture('mobile-cart');
  await page.goto('/checkout');
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(mobile ? 'mobile-checkout' : 'desktop-checkout', !mobile);

  expect(errors).toEqual([]);
});

test('capture seller dashboard for README', async ({ page, scenario }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Seller overview is shown in the desktop gallery.');
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await scenario.authenticate('SELLER');
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  await expect(page.locator('.metric-card')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}desktop-seller.png`, fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});
