import { test, expect, ids, product } from './fixtures';
import type { Page } from '@playwright/test';

const technicalError = { code: 'INTERNAL_SQL_FAILURE', message: 'SELECT * FROM secret_table; SQL Exception stack at db.js:42',
  requestId: 'private-request-identifier', details: [{ message: 'internal connection credentials' }] };
async function expectNoTechnicalDetails(page: Page) {
  await expect(page.locator('body')).not.toContainText('INTERNAL_SQL_FAILURE');
  await expect(page.locator('body')).not.toContainText('secret_table');
  await expect(page.locator('body')).not.toContainText('private-request-identifier');
  await expect(page.locator('body')).not.toContainText('Thông tin hỗ trợ');
}

test('failed seller write shows friendly feedback and preserves draft for retry', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên điểm nhận hàng', { exact: false }).fill('Thư viện mới');
  await dialog.getByLabel('Chỉ dẫn nhận hàng', { exact: false }).fill('Nhận tại sảnh');
  const path = '**/api/v1/seller/pickup-points';
  await page.route(path, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: technicalError }) : route.fallback());
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(page.locator('.feedback-notice')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(dialog.getByLabel('Tên điểm nhận hàng', { exact: false })).toHaveValue('Thư viện mới');
  await expect(dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true })).toBeEnabled();
  await expectNoTechnicalDetails(page);
  await page.unroute(path);
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm điểm nhận hàng');
});

test('offline add to cart ends loading and works after reconnecting', async ({ page, context }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true });
  await expect(add).toBeEnabled();
  await context.setOffline(true);
  await expect(page.locator('.network-offline')).toContainText('mất kết nối');
  await add.click();
  await expect(page.locator('.feedback-notice')).toContainText('Kiểm tra mạng');
  await expect(add).toHaveAttribute('data-cart-state', 'idle');
  await expect(add).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!))).toEqual([]);
  await context.setOffline(false);
  await expect(page.locator('.network-offline')).toHaveCount(0);
  await add.click();
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm 1');
});

test('slow write times out, unlocks form, keeps draft and reuses retry idempotency key', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('Tên điểm nhận hàng', { exact: false });
  await name.fill('Sảnh nhà C');
  await page.clock.install();
  const keys: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/seller/pickup-points', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    keys.push(route.request().headers()['idempotency-key']);
    if (keys.length > 1) return route.fallback();
    await gate;
    await route.abort().catch(() => {}); // The deadline may already have cancelled this request.
  });
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect.poll(() => keys.length).toBe(1);
  await dialog.locator('form').dispatchEvent('submit');
  await expect(name).toBeDisabled();
  await page.clock.runFor(600);
  await expect(page.locator('.network-activity')).toContainText('Đang xử lý yêu cầu');
  await page.clock.runFor(7600);
  await expect(page.locator('.network-activity')).toContainText('Phản hồi đang chậm');
  await page.clock.runFor(7000);
  await expect(page.locator('.feedback-notice')).toContainText('Chưa xác nhận được kết quả');
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Sảnh nhà C');
  expect(keys).toHaveLength(1);
  release();
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(scenario.shop.pickupPoints.filter(point => point.name === 'Sảnh nhà C')).toHaveLength(1);
});

test('category load failure is visible and blocks product save until retry succeeds', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const path = '**/api/v1/categories';
  await page.route(path, route => route.fulfill({ status: 500, json: technicalError }));
  await page.goto('/seller/products/new');
  await expect(page.locator('main .error-box')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.getByRole('button', { name: 'Thêm sản phẩm', exact: true })).toBeDisabled();
  await expectNoTechnicalDetails(page);
  expect(scenario.calls.some(request => request.url().endsWith('/seller/products/new'))).toBe(false);
  await page.unroute(path);
  await page.locator('main .error-box').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thêm sản phẩm', exact: true })).toBeEnabled();
});

test('missing product never opens an empty edit form and can be retried', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const path = `**/api/v1/seller/products/${ids.product}`;
  await page.route(path, route => route.fulfill({ status: 404, json: { code: 'PRODUCT_NOT_FOUND', message: 'private-request-identifier' } }));
  await page.goto(`/seller/products/${ids.product}/edit`);
  await expect(page.locator('main .error-box')).toContainText('Không tìm thấy');
  await expect(page.locator('#sellerproducteditpage-field-1')).toHaveCount(0);
  await expectNoTechnicalDetails(page);
  await page.unroute(path);
  await page.locator('main .error-box').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('#sellerproducteditpage-field-1')).toHaveValue(product.name);
});

test('failed bank instructions preserve order and provide a retry in payment panel', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  scenario.order.paymentMethod = 'BANK_TRANSFER';
  scenario.order.status = 'ACCEPTED';
  const path = '**/api/v1/me/orders/*/payment-instructions';
  await page.route(path, route => route.fulfill({ status: 503, json: technicalError }));
  await page.goto(`/account/orders/${ids.order}`);
  await expect(page.locator('.bank-transfer-box .error-box')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
  await expectNoTechnicalDetails(page);
  await page.unroute(path);
  await page.locator('.bank-transfer-box').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('.payment-instructions-panel')).toContainText('Demo Bank');
});

test('failed notification action ends loading and does not mark it read', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  scenario.notifications = [{ id: 'notification-test', recipientProfileId: ids.user, type: 'ORDER_CREATED',
    orderId: ids.order, isRead: false, createdAt: new Date().toISOString() }];
  await page.route('**/api/v1/seller/notifications/*/read', route => route.fulfill({ status: 500, json: technicalError }));
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Đã đọc', exact: true }).click();
  await expect(page.locator('.feedback-notice')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.getByRole('button', { name: 'Đã đọc', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Thông báo mới (1)', exact: true })).toBeVisible();
  await expectNoTechnicalDetails(page);
});

test('failed profile load offers retry instead of reporting missing seller permission', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const path = '**/api/v1/me';
  await page.route(path, route => route.fulfill({ status: 503, json: technicalError }));
  await page.goto('/seller');
  await expect(page.locator('main .error-box')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.locator('body')).not.toContainText('Bạn không có quyền');
  await expectNoTechnicalDetails(page);
  await page.unroute(path);
  await page.locator('main .error-box').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('.seller-dashboard-page')).toBeVisible();
});

test('bad saved cart rows are removed with feedback and valid rows stay', async ({ page }) => {
  await page.addInitScript(item => localStorage.setItem('school_shop_cart_v1', JSON.stringify([
    { kind: 'PRODUCT', catalogId: item.id, name: item.name, price: item.price, quantity: 1 },
    { kind: 'PRODUCT', catalogId: 'broken', name: 'Hỏng', price: 1, quantity: -1 },
  ])), product);
  await page.goto('/cart');
  await expect(page.locator('.feedback-notice')).toContainText('không còn hợp lệ');
  await expect(page.locator('.cart-item-card')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!).length)).toBe(1);
});

test('storage quota failure warns user and keeps cart usable in current tab', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'school_shop_cart_v1') throw new DOMException('storage technical stack', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true }).click();
  await expect(page.locator('.feedback-notice')).toContainText('chưa lưu được giỏ trên máy');
  await expect(page.locator('body')).not.toContainText('QuotaExceededError');
  await page.locator('a[href="/cart"]').first().click();
  await expect(page.locator('.cart-item-card')).toHaveCount(1);
});

test('non JSON response shows retry feedback instead of leaving catalog loading', async ({ page }) => {
  await page.route('**/api/v1/products?*', route => route.fulfill({ contentType: 'text/html', body: '<html>private-request-identifier SQL Exception</html>' }));
  await page.goto('/');
  await expect(page.locator('#catalog .error-box')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.locator('#catalog .error-box').getByRole('button', { name: 'Thử lại', exact: true })).toBeEnabled();
  await expectNoTechnicalDetails(page);
});

test('failed upload ends loading and permits retry with the same file', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/products/new');
  const path = '**/api/v1/seller/assets';
  await page.route(path, route => route.fulfill({ status: 500, json: technicalError }));
  const file = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64') };
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.locator('.feedback-notice')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await expect(page.locator('input[type="file"]')).toHaveValue('');
  await expect(page.getByText('Đã tải ảnh', { exact: true })).toHaveCount(0);
  await expectNoTechnicalDetails(page);
  await page.unroute(path);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText('Đã tải ảnh', { exact: true })).toBeVisible();
});

test('background catalog failure keeps products visible and cart usable', async ({ page }) => {
  test.setTimeout(45000);
  await page.goto('/');
  const add = page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true });
  await expect(add).toBeEnabled();
  const path = '**/api/v1/products?*';
  await page.route(path, route => route.fulfill({ status: 503, json: technicalError }));
  await expect(page.locator('.feedback-notice')).toContainText('Dịch vụ đang gặp sự cố', { timeout: 20000 });
  await expect(add).toBeVisible();
  await expect(page.locator('#catalog .error-box')).toHaveCount(0);
  await expectNoTechnicalDetails(page);
  await page.unroute(path);
  await add.click();
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm 1');
});
