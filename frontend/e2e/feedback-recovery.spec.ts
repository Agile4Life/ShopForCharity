import { test, expect, ids, product } from './fixtures';
import type { Page } from '@playwright/test';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64');
async function fillCheckout(page: Page) {
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
}

for (const failure of [
  { status: 403, code: 'PRIVATE_INTERNAL_CODE', expected: 'chưa có quyền' },
  { status: 429, code: 'RATE_LIMITED', expected: 'thao tác hơi nhanh' },
  { status: 409, code: 'VERSION_CONFLICT', expected: 'Dữ liệu đã thay đổi' },
]) {
  test(`seller ${failure.status} failure provides actionable feedback without server text`, async ({ page, scenario }) => {
    await scenario.authenticate('SELLER');
    await page.goto('/seller/settings');
    await page.route('**/api/v1/seller/shop-settings', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: failure.status, json: { code: failure.code, message: 'ServerException SELECT hidden credentials' } }) : route.fallback());
    await page.locator('#sellersettingspage-field-1').fill('Shop mới');
    await page.locator('main form').first().dispatchEvent('submit');
    await expect(page.locator('.feedback-notice')).toContainText(failure.expected);
    await expect(page.locator('#sellersettingspage-field-1')).toHaveValue('Shop mới');
    await expect(page.locator('body')).not.toContainText('ServerException');
  });
}

test('slow cart availability check times out and allows retry without losing cart', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true });
  await expect(add).toBeEnabled();
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route(`**/api/v1/products/${ids.product}`, async route => {
    reads++;
    if (reads > 1) return route.fallback();
    await gate;
    await route.abort().catch(() => {});
  });
  await add.click();
  await expect.poll(() => reads).toBe(1);
  await page.clock.runFor(15200);
  await expect(page.locator('.feedback-notice')).toContainText('Phản hồi đang chậm');
  await expect(add).toBeEnabled();
  release();
  await add.click();
  await expect(add).toHaveAttribute('data-cart-state', 'added');
});

test('duplicate checkout submission creates one order while controls show loading', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/checkout');
  await fillCheckout(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route('**/api/v1/orders', async route => { writes++; await gate; await route.fallback(); });
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await page.locator('main form').dispatchEvent('submit');
  await expect(page.locator('main button[type="submit"]')).toBeDisabled();
  expect(writes).toBe(1);
  release();
  await expect(page).toHaveURL('/order-success');
  expect(scenario.mutations('/orders')).toHaveLength(1);
});

test('shop closes during checkout: correct message and cart preserved', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/checkout');
  await fillCheckout(page);
  scenario.shop.acceptingOrders = false;
  await page.route('**/api/v1/orders', route => route.fulfill({ status: 409, json: { code: 'SHOP_CLOSED', message: 'SHOP_CLOSED' } }));
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect(page.locator('main .error-box')).toContainText('Shop đang ngừng nhận đơn mới');
  await expect(page.locator('body')).not.toContainText('Giá hoặc số lượng vừa thay đổi');
  await expect(page.locator('main button[type="submit"]')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!).length)).toBe(1);
});

test('successful payment report stays visible when its follow-up read fails', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  scenario.order.paymentMethod = 'BANK_TRANSFER';
  scenario.order.status = 'ACCEPTED';
  await page.goto(`/account/orders/${ids.order}`);
  await expect(page.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true })).toBeEnabled();
  await page.route(`**/api/v1/me/orders/${ids.order}`, route => scenario.order.paymentStatus === 'REPORTED'
    ? route.fulfill({ status: 503, json: { code: 'DB_READ_FAILED', message: 'SELECT private_table' } }) : route.fallback());
  await page.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true }).click();
  await expect(page.locator('.header-status-badges')).toContainText('Đã báo chuyển khoản');
  await expect(page.locator('.feedback-notice')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('private_table');
  expect(scenario.mutations('/payment-report')).toHaveLength(1);
});

test('failed product image has a readable fallback while product remains usable', async ({ page, scenario }) => {
  scenario.products[0].imageUrl = 'http://127.0.0.1:4173/missing-product.png';
  await page.route('**/missing-product.png', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/products/banh-thu');
  await expect(page.locator('.detail-media .asset-image-fallback')).toContainText('Chưa tải được ảnh');
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm 1');
});

test('expired QR image allows fetching a fresh signed URL', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  scenario.order.paymentMethod = 'BANK_TRANSFER';
  scenario.order.status = 'ACCEPTED';
  let requests = 0;
  await page.route('**/api/v1/me/orders/*/payment-instructions', route => {
    requests++;
    return route.fulfill({ json: { orderCode: scenario.order.orderCode, bankName: 'Demo Bank', accountNumber: '123456',
      accountHolder: 'DEMO SHOP', amount: 10000, transferContent: scenario.order.orderCode,
      qrSignedUrl: `http://127.0.0.1:4173/${requests === 1 ? 'expired' : 'valid'}-qr.png` } });
  });
  await page.route('**/expired-qr.png', route => route.fulfill({ status: 403, body: '' }));
  await page.route('**/valid-qr.png', route => route.fulfill({ contentType: 'image/png', body: image }));
  await page.goto(`/account/orders/${ids.order}`);
  await expect(page.locator('.qr-container')).toContainText('Chưa tải được ảnh');
  await page.getByRole('button', { name: 'Tải lại ảnh', exact: true }).click();
  const qr = page.getByRole('img', { name: 'Mã QR Chuyển khoản', exact: true });
  await expect(qr).toHaveAttribute('src', /valid-qr/);
  await expect(qr).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.bank-details-list')).toContainText('123456');
});

test('unavailable clipboard shows download alternative and unlocks copy button', async ({ page, scenario }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await scenario.cart();
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect(page).toHaveURL('/order-success');
  await page.getByRole('button', { name: 'Sao chép thông tin tra cứu', exact: true }).click();
  await expect(page.locator('.feedback-notice')).toContainText('Chưa sao chép được');
  await expect(page.getByRole('button', { name: 'Sao chép thông tin tra cứu', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Tải thông tin về máy', exact: true })).toBeEnabled();
});
