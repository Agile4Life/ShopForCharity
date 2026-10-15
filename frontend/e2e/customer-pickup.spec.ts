import { test, expect, ids, submit, expectMutation } from './fixtures';

async function fillBuyer(page: import('@playwright/test').Page) {
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
}

for (const registered of [false, true]) {
  test(`${registered ? 'customer' : 'guest'} selects shop pickup point and referrer without email input and sees thank-you popup`, async ({ page, scenario }, testInfo) => {
    if (registered) await scenario.authenticate('CUSTOMER');
    await scenario.cart();
    await page.goto('/checkout');
    await expect(page.locator('#email')).toHaveCount(0);
    await expect(page.locator('#customPickupLocation')).toHaveCount(0);
    await fillBuyer(page);
    await page.locator('#pickupPointId').selectOption(ids.pickup);
    await page.locator('#referrer').selectOption('Nguyễn Minh Anh - 12A1');
    await expect(page.locator('.pickup-instructions')).toHaveText('Gặp tại cổng');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('customer-pickup.png'), fullPage: true });
    await submit(page);
    await expect(page).toHaveURL('/order-success');
    await expect(page.getByRole('dialog', { name: 'Lời cảm ơn' })).toContainText(
      'Cảm ơn bạn đã ủng hộ dự án gói ấm trao em, toàn bộ số tiền lời sẽ đóng góp để mua quà cho các em ở trung tâm nhân đạo Quê Hương',
    );
    await page.getByRole('button', { name: 'Đã hiểu', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.field-value').filter({ hasText: 'Cổng trường' })).toBeVisible();
    await expectMutation(scenario, '/orders', { pickupPointId: ids.pickup, referrer: 'Nguyễn Minh Anh - 12A1' });
    const body = scenario.mutations('/orders')[0].postDataJSON();
    expect(body.buyer).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('customPickupLocation');
    expect(body).not.toHaveProperty('customPickupInstructions');
    await page.getByRole('link', { name: 'Xem đơn hàng', exact: false }).click();
    if (!registered) await page.getByRole('button', { name: 'Tra cứu đơn hàng', exact: true }).click();
    await expect(page.locator('main')).toContainText('Cổng trường');
    await expect(page.locator('main')).toContainText('Nguyễn Minh Anh - 12A1');
  });
}

test('validates required shop pickup point selection and blocks submission when shop has no active pickup points', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/checkout');
  await fillBuyer(page);
  await expect(page.locator('#pickupPointId')).toHaveValue('');
  await submit(page);
  await expect(page.locator('#pickupPointId')).toBeFocused();
  await expect(page.locator('#pickup-error')).toBeVisible();
  expect(scenario.mutations('/orders')).toHaveLength(0);
  scenario.shop.pickupPoints = [];
  await page.reload();
  await expect(page.getByText('Shop chưa mở điểm nhận hàng. Vui lòng quay lại sau.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeDisabled();
});

test('seller confirms order using active shop pickup point', async ({ page, scenario }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T02:00:00Z'));
  await scenario.authenticate('SELLER');
  await page.goto(`/seller/orders/${ids.order}`);
  await expect(page.locator('.buyer-info-grid')).toContainText('Cổng trường');
  await page.getByRole('button', { name: /Ghi nhận liên hệ/ }).click();
  await page.getByRole('button', { name: 'Lưu liên hệ', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xác nhận đơn hàng', exact: true }).click();
  await expect(page.locator('#sellerorderdetailpage-field-4')).toHaveValue(ids.pickup);
  await page.getByRole('button', { name: 'Ngày mai', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đơn hàng', exact: true }).click();
  await expectMutation(scenario, '/accept', { expectedVersion: 8, confirmedPickupPointId: ids.pickup });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.buyer-info-grid')).toContainText('Cổng trường');
});
