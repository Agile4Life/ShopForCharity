import { test, expect, ids, submit, expectMutation } from './fixtures';

test.beforeEach(async ({ scenario }) => { await scenario.authenticate('SELLER'); });

test('dashboard, order filters and audit filters', async ({ page, scenario }) => {
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  await page.goto('/seller/orders');
  await page.getByLabel('Trạng thái đơn', { exact: true }).selectOption('PENDING_CONTACT');
  await page.getByLabel('Trạng thái thanh toán', { exact: true }).selectOption('UNPAID');
  await page.getByLabel('Tìm theo mã đơn').fill('ORD-TEST001');
  await expect.poll(() => scenario.calls.some(r => {
    const u = new URL(r.url());
    return u.pathname.endsWith('/seller/orders') && u.searchParams.get('status') === 'PENDING_CONTACT'
      && u.searchParams.get('paymentStatus') === 'UNPAID' && u.searchParams.get('orderCode') === 'ORD-TEST001';
  })).toBe(true);
  await page.goto('/seller/logs');
  await page.getByLabel('Lọc theo hành động').fill('ORDER_CREATED');
  await expect.poll(() => scenario.calls.some(r => new URL(r.url()).searchParams.get('action') === 'ORDER_CREATED')).toBe(true);
});

test('seller records contact, accepts, prepares, receives payment and completes', async ({ page, scenario }) => {
  await page.goto(`/seller/orders/${ids.order}`);
  await page.getByRole('button', { name: /Ghi nhận liên hệ/ }).click();
  await page.getByRole('button', { name: 'Lưu liên hệ', exact: true }).click();
  await expectMutation(scenario, '/contact-attempts', { expectedVersion: 7, channel: 'PHONE', outcome: 'SUCCESS' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chấp nhận đơn hàng', exact: true }).click();
  await page.locator('#sellerorderdetailpage-field-4').selectOption(ids.pickup);
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await page.locator('#sellerorderdetailpage-field-5').fill(future);
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expectMutation(scenario, '/accept', { expectedVersion: 8, confirmedPickupPointId: ids.pickup });
  await page.getByRole('button', { name: /Chuyển sang.*Đang chuẩn bị/ }).click();
  await expectMutation(scenario, '/prepare', { expectedVersion: 9 });
  await page.getByRole('button', { name: /Chuyển sang.*Sẵn sàng/ }).click();
  await expectMutation(scenario, '/ready', { expectedVersion: 10 });
  await expect(page.getByRole('button', { name: 'Bàn giao & Hoàn tất đơn', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Xác nhận đã thu đủ tiền/ }).click();
  await page.getByRole('button', { name: 'Xác nhận PAID', exact: true }).click();
  await expectMutation(scenario, '/confirm-payment', { expectedVersion: 11, amount: 10000 });
  await page.getByRole('button', { name: 'Bàn giao & Hoàn tất đơn', exact: true }).click();
  await expectMutation(scenario, '/complete', { expectedVersion: 12 });
  await expect(page.locator('main .badge').filter({ hasText: /^Hoàn tất$/ })).toBeVisible();
});

for (const action of ['reject', 'cancel'] as const) {
  test(`seller ${action} submits reason and version`, async ({ page, scenario }) => {
    await page.goto(`/seller/orders/${ids.order}`);
    await page.getByRole('button', { name: action === 'reject' ? 'Từ chối đơn' : 'Hủy đơn hàng này', exact: true }).click();
    await page.getByRole('dialog').locator('textarea').fill('Không thể giao hàng');
    await page.getByRole('dialog').locator('button[type="submit"]').click();
    await expectMutation(scenario, `/${action}`, { reason: 'Không thể giao hàng', expectedVersion: 7 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('seller dismisses payment report', async ({ page, scenario }) => {
  scenario.order.paymentMethod = 'BANK_TRANSFER';
  scenario.order.paymentStatus = 'REPORTED';
  await page.goto(`/seller/orders/${ids.order}`);
  await page.getByRole('button', { name: /Bác bỏ báo cáo/ }).click();
  await page.getByRole('dialog').locator('textarea').fill('Chưa thấy giao dịch');
  await page.getByRole('dialog').locator('button[type="submit"]').click();
  await expectMutation(scenario, '/dismiss-payment-report', { expectedVersion: 7, reason: 'Chưa thấy giao dịch' });
  await expect.poll(() => scenario.order.paymentStatus).toBe('UNPAID');
});

for (const received of [5000, 15000]) {
  test(`refund uses actual received amount ${received} rather than order total`, async ({ page, scenario }) => {
    scenario.order.status = 'CANCELLED';
    scenario.order.paymentStatus = 'REFUND_PENDING';
    scenario.order.receivedAmount = received;
    await page.goto(`/seller/orders/${ids.order}`);
    await page.getByRole('button', { name: /Xác nhận đã hoàn tiền đủ/ }).click();
    await page.locator('#sellerorderdetailpage-field-12').fill('REFUND-TEST');
    await page.getByRole('button', { name: 'Xác nhận đã hoàn đủ tiền', exact: true }).click();
    await expectMutation(scenario, '/confirm-refund', { expectedVersion: 7, amount: received, bankReference: 'REFUND-TEST' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => scenario.order.paymentStatus).toBe('REFUNDED');
  });
}

test('create product with uploaded image then edit versioned price', async ({ page, scenario }) => {
  await page.goto('/seller/products/new');
  await page.locator('input[type="file"]').setInputFiles({ name: 'product.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByText('Đã gắn Asset ID', { exact: true })).toBeVisible();
  await page.locator('#sellerproducteditpage-field-1').fill('Sản phẩm mới');
  await page.locator('#sellerproducteditpage-field-2').selectOption(ids.category);
  await page.locator('#sellerproducteditpage-field-3').fill('12000');
  await page.locator('#sellerproducteditpage-field-4').fill('8');
  await submit(page);
  await expect(page).toHaveURL('/seller/products');
  await expectMutation(scenario, '/seller/products', { name: 'Sản phẩm mới', price: 12000, stockOnHand: 8, imageAssetId: 'image-test' });
  await page.goto(`/seller/products/${ids.product}/edit`);
  await page.locator('#sellerproducteditpage-field-3').fill('15000');
  await submit(page);
  await expect(page).toHaveURL('/seller/products');
  await expectMutation(scenario, `/seller/products/${ids.product}`, { expectedVersion: 2, price: 15000 });
});

test('product archive/reactivate and stock adjustment use independent inventory version', async ({ page, scenario }) => {
  await page.goto('/seller/products');
  const row = page.getByRole('row').filter({ hasText: 'Bánh thử' });
  await row.getByRole('button', { name: 'Ẩn', exact: true }).click();
  await expectMutation(scenario, '/archive', { expectedVersion: 2 });
  await row.getByRole('button', { name: 'Mở bán', exact: true }).click();
  await expectMutation(scenario, '/activate', { expectedVersion: 3 });
  await row.getByRole('button', { name: 'Tồn kho', exact: true }).click();
  await page.locator('#sellerproductspage-field-1').fill('3');
  await page.locator('#sellerproductspage-field-2').fill('Nhập thêm');
  await page.getByRole('button', { name: 'Lưu điều chỉnh', exact: true }).click();
  await expectMutation(scenario, '/stock-adjustments', { expectedVersion: 4, deltaOnHand: 3, reason: 'Nhập thêm' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('create and edit combo components', async ({ page, scenario }) => {
  await page.goto('/seller/combos/new');
  await page.locator('#sellercomboeditpage-field-1').fill('Combo mới');
  await page.locator('#sellercomboeditpage-field-2').fill('25000');
  await page.getByLabel('Sản phẩm thành phần 1').selectOption(ids.product);
  await page.getByLabel('Sản phẩm thành phần 2').selectOption(ids.other);
  await submit(page);
  await expect(page).toHaveURL('/seller/combos');
  await expectMutation(scenario, '/seller/combos', { name: 'Combo mới', items: [{ productId: ids.product, quantity: 1 }, { productId: ids.other, quantity: 1 }] });
  await page.goto(`/seller/combos/${ids.combo}/edit`);
  await page.locator('#sellercomboeditpage-field-2').fill('30000');
  await submit(page);
  await expect(page).toHaveURL('/seller/combos');
  await expectMutation(scenario, `/seller/combos/${ids.combo}`, { expectedVersion: 3, price: 30000 });
});

test('shop settings update, create pickup point and toggle with version', async ({ page, scenario }) => {
  await page.goto('/seller/settings');
  await page.locator('#sellersettingspage-field-1').fill('Shop mới');
  await page.locator('main form').first().locator('button[type="submit"]').click();
  await expectMutation(scenario, '/seller/shop-settings', { name: 'Shop mới', expectedVersion: 2 });
  await page.getByRole('button', { name: 'Đang hoạt động', exact: true }).click();
  await expectMutation(scenario, `/pickup-points/${ids.pickup}`, { active: false, expectedVersion: 5 });
  await expect(page.getByRole('button', { name: 'Tạm ẩn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await page.getByRole('dialog').locator('input[type="text"]').fill('Thư viện');
  await page.getByRole('dialog').locator('button[type="submit"]').click();
  await expectMutation(scenario, '/seller/pickup-points', { name: 'Thư viện', active: true });
  await expect(page.locator('.pickup-points-list')).toContainText('Thư viện');
});
