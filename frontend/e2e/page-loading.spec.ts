import { test, expect } from './fixtures';

test('stalled page bundle leaves loading and allows reload after recovery', async ({ page, scenario }) => {
  await scenario.cart();
  await page.clock.install();
  const path = '**/assets/CheckoutPage-*.js';
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route(path, async route => { requests++; await gate; await route.abort().catch(() => {}); });
  await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => requests).toBe(1);
  await page.clock.runFor(15200);
  await expect(page.getByRole('heading', { name: 'Chưa mở được trang', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lại trang', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!).length)).toBe(1);
  await page.unroute(path);
  release();
  await page.getByRole('button', { name: 'Tải lại trang', exact: true }).click();
  await expect(page.locator('#fullName')).toBeVisible();
});

test('missing page bundle shows friendly retry without module or browser error text', async ({ page, scenario }) => {
  await scenario.cart();
  const path = '**/assets/CheckoutPage-*.js';
  await page.route(path, route => route.fulfill({ status: 404, contentType: 'text/html', body: 'InternalPrivateModuleException' }));
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Chưa mở được trang', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('InternalPrivateModuleException');
  await expect(page.locator('body')).not.toContainText('Failed to fetch dynamically imported module');
  await page.unroute(path);
  await page.getByRole('button', { name: 'Tải lại trang', exact: true }).click();
  await expect(page.locator('#fullName')).toBeVisible();
});

test('copying saved order credentials still works offline', async ({ page, scenario, context }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: () => Promise.resolve() },
  }));
  await scenario.cart();
  await page.goto('/checkout');
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
  const submit = page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL('/order-success');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Sao chép thông tin tra cứu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đã sao chép', exact: true })).toBeEnabled();
  await expect(page.locator('.network-offline')).toBeVisible();
});
