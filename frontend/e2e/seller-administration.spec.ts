import { test, expect, ids, expectMutation } from './fixtures';

test('seller reads notification and opens referenced order', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  scenario.notifications = [{ id: 'notification-test', recipientProfileId: ids.user, type: 'ORDER_CREATED',
    orderId: ids.order, isRead: false, createdAt: new Date().toISOString() }];
  await page.goto('/seller');
  await page.getByRole('button', { name: 'Đã đọc', exact: true }).click();
  await expect.poll(() => scenario.mutations('/read').length).toBe(1);
  await expect(page.getByRole('heading', { name: 'Thông báo mới (0)', exact: true })).toBeVisible();
  await page.locator(`.notifications-list a[href="/seller/orders/${ids.order}"]`).click();
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
});

test('seller uploads payment QR, saves bank configuration and closes sales', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  await page.locator('input[type="file"]').setInputFiles({ name: 'qr.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByText('Đã gắn Asset QR', { exact: true })).toBeVisible();
  expect(scenario.mutations('/seller/assets')[0].postData()).toContain('PAYMENT_QR');
  await page.locator('#sellersettingspage-field-4').fill('Demo Bank');
  await page.locator('#sellersettingspage-field-5').fill('123456');
  await page.locator('#sellersettingspage-field-6').fill('DEMO SHOP');
  await page.locator('main input[type="checkbox"]').uncheck();
  await page.locator('main form').first().locator('button[type="submit"]').click();
  await expectMutation(scenario, '/seller/shop-settings', { expectedVersion: 2, acceptingOrders: false,
    bankName: 'Demo Bank', accountNumber: '123456', accountHolder: 'DEMO SHOP', qrAssetId: 'image-test' });
  await expect(page.getByText('Cập nhật cấu hình shop và ngân hàng thành công!', { exact: true })).toBeVisible();
});
