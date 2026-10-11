import { test, expect, ids, submit } from './fixtures';

const orderCode = 'ORD-0123456789ABCDEF';
for (const width of [1280, 320]) {
  test(`seller pages hide technical labels and preserve order codes at ${width}px`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await scenario.authenticate('SELLER');
    scenario.order.orderCode = orderCode;
    scenario.order.paymentEvents = [{ id: 'event', type: 'PAYMENT_CONFIRMED', toStatus: 'PAID', amount: 35000,
      createdAt: scenario.order.createdAt }];
    scenario.notifications = [{ id: 'notification', recipientProfileId: ids.user, type: 'PAYMENT_REVIEW_REQUIRED', orderId: ids.order,
      isRead: false, createdAt: scenario.order.createdAt }];
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (value: string) => { localStorage.setItem('test-copied-code', value); },
    } }));
    await page.goto('/seller');
    await expect(page.locator('main')).toContainText('Cần kiểm tra thanh toán');
    await expect(page.locator('main')).not.toContainText('PAYMENT_REVIEW_REQUIRED');
    await expect(page.getByRole('link', { name: 'Xem đơn hàng', exact: true })).toHaveAttribute('href', `/seller/orders/${ids.order}`);
    await page.goto('/seller/orders');
    await expect(page.locator('.readable-order-code').first()).toHaveText(orderCode);
    const search = page.waitForRequest(req => new URL(req.url()).searchParams.get('orderCode') === orderCode);
    await page.getByLabel('Tìm theo mã đơn').fill('ord-0123 4567 89ab cdef');
    await search;
    await page.goto(`/seller/orders/${ids.order}`);
    await expect(page.locator('main')).toContainText('Xác nhận thanh toán');
    await expect(page.locator('main')).not.toContainText('PAYMENT_CONFIRMED');
    await expect(page.locator('main')).not.toContainText('Version:');
    await expect(page.locator('main')).not.toContainText(/\b(?:PAID|UNPAID|REFUNDED)\b/);
    expect(await page.locator('h1 .readable-order-code').textContent()).toBe(orderCode);
    await expect(page.locator('h1 .readable-order-code > span')).toHaveCount(5);
    await page.getByRole('button', { name: 'Sao chép mã đơn hàng', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('test-copied-code'))).toBe(orderCode);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`readable-order-${width}.png`), fullPage: true });
  });

  test(`nested audit data becomes readable text at ${width}px`, async ({ page, scenario }) => {
    await page.setViewportSize({ width, height: 900 });
    await scenario.authenticate('SELLER');
    const details = [
      '{"details":{"paymentStatus":"PAID","items":[{"quantity":2,"price":35000}]}}',
      '[{"quantity":3},{"active":false}]',
      '{"status":',
      '"{\\"total\\":35000}"',
    ];
    await page.route('**/api/v1/seller/audit-logs**', route => route.fulfill({ json: {
      content: details.map((safeAfter, i) => ({ id: `log-${i}`, action: 'ORDER_CREATED', actorType: 'SELLER',
        entityType: 'ORDER', entityId: ids.order, createdAt: scenario.order.createdAt, safeAfter })),
      page: 0, totalPages: 1, totalElements: details.length, size: 20,
    } }));
    await page.goto('/seller/logs');
    const table = page.locator('.logs-table');
    await expect(table).toContainText('Thanh toán: Đã thanh toán');
    await expect(table).toContainText(/Giá: 35\.000\s*₫/);
    await expect(table).toContainText('Số lượng: 3');
    await expect(table).toContainText('Hoạt động: Không');
    await expect(table).toContainText('Chi tiết chưa thể hiển thị');
    await expect(table).toContainText(/Tổng tiền: 35\.000\s*₫/);
    await expect(table).not.toContainText(/[{}\[\]]|paymentStatus|PAID/);
    await expect(table.getByRole('link', { name: 'Xem đơn hàng', exact: true }).first()).toHaveAttribute('href', `/seller/orders/${ids.order}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('guest lookup accepts a spaced lowercase order code', async ({ page, scenario }) => {
  scenario.order.orderCode = orderCode;
  await page.goto('/guest-order');
  await page.locator('#orderCode').fill('ord-0123 4567 89ab cdef');
  await page.locator('input[type="password"]').fill('secret-test-token');
  await submit(page);
  await expect(page.locator('h1 .readable-order-code')).toHaveText(orderCode);
  expect(scenario.mutations('/guest/orders/access')[0].postDataJSON()).toMatchObject({ orderCode });
});

test('customer order list, detail and success page keep the complete readable code', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  scenario.order.orderCode = orderCode;
  await page.goto('/account/orders');
  await expect(page.locator('.readable-order-code').first()).toHaveText(orderCode);
  await page.goto(`/account/orders/${ids.order}`);
  await expect(page.locator('h1 .readable-order-code')).toHaveText(orderCode);
  await expect(page.getByRole('button', { name: 'Sao chép mã đơn hàng', exact: true })).toBeVisible();
  await scenario.cart();
  await page.goto('/checkout');
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
  await submit(page);
  await expect(page).toHaveURL('/order-success');
  await expect(page.locator('.readable-order-code')).toHaveText(orderCode);
  await expect(page.getByRole('button', { name: 'Sao chép mã đơn hàng', exact: true })).toBeVisible();
});
