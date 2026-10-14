import { test, expect, ids, submit, expectMutation } from './fixtures';

async function fillBuyer(page: import('@playwright/test').Page) {
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
}

for (const registered of [false, true]) {
  test(`${registered ? 'customer' : 'guest'} submits their own destination without shop suggestions`, async ({ page, scenario }, testInfo) => {
    if (registered) await scenario.authenticate('CUSTOMER');
    scenario.shop.pickupPoints = [];
    await scenario.cart();
    await page.goto('/checkout');
    await expect(page.getByRole('radio', { name: /Tự chọn địa điểm/ })).toBeChecked();
    await expect(page.locator('#pickupPointId')).toBeHidden();
    await fillBuyer(page);
    await page.locator('#customPickupLocation').fill('  Sảnh nhà B  ');
    await page.locator('#customPickupInstructions').fill('  Ghế đá số 3.\nGọi khi đến.  ');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('customer-pickup.png'), fullPage: true });
    await submit(page);
    await expect(page).toHaveURL('/order-success');
    await expect(page.locator('.field-value').filter({ hasText: 'Sảnh nhà B' })).toBeVisible();
    await expectMutation(scenario, '/orders', { customPickupLocation: 'Sảnh nhà B', customPickupInstructions: 'Ghế đá số 3.\nGọi khi đến.' });
    expect(scenario.mutations('/orders')[0].postDataJSON()).not.toHaveProperty('pickupPointId');
    await page.getByRole('link', { name: 'Xem đơn hàng', exact: false }).click();
    if (!registered) await page.getByRole('button', { name: 'Tra cứu đơn hàng', exact: true }).click();
    await expect(page.locator('main')).toContainText('Sảnh nhà B');
    await expect(page.locator('main')).toContainText('Ghế đá số 3.');
  });
}

test('switching choice keeps drafts and sends only the selected destination', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/checkout');
  await fillBuyer(page);
  await page.locator('#customPickupLocation').fill('Thư viện');
  await page.locator('#customPickupInstructions').fill('Tầng 2');
  await page.getByRole('radio', { name: /Chọn gợi ý của shop/ }).check();
  await expect(page.locator('#pickupPointId')).toHaveValue('');
  await submit(page);
  await expect(page.locator('#pickupPointId')).toBeFocused();
  expect(scenario.mutations('/orders')).toHaveLength(0);
  await page.locator('#pickupPointId').selectOption(ids.pickup);
  await expect(page.locator('.pickup-instructions')).toHaveText('Gặp tại cổng');
  await page.getByRole('radio', { name: /Tự chọn địa điểm/ }).check();
  await expect(page.locator('#customPickupLocation')).toHaveValue('Thư viện');
  await expect(page.locator('#customPickupInstructions')).toHaveValue('Tầng 2');
  await page.getByRole('radio', { name: /Chọn gợi ý của shop/ }).check();
  await submit(page);
  await expect(page).toHaveURL('/order-success');
  const body = scenario.mutations('/orders')[0].postDataJSON();
  expect(body.pickupPointId).toBe(ids.pickup);
  expect(body).not.toHaveProperty('customPickupLocation');
  expect(body).not.toHaveProperty('customPickupInstructions');
});

test('empty custom destination is validated and no suggestions do not block a custom order', async ({ page, scenario }) => {
  scenario.shop.pickupPoints = [];
  await scenario.cart();
  await page.goto('/checkout');
  await fillBuyer(page);
  await page.locator('#customPickupLocation').fill('   ');
  await submit(page);
  await expect(page.locator('#customPickupLocation')).toBeFocused();
  await expect(page.locator('#custom-pickup-error')).toBeVisible();
  expect(scenario.mutations('/orders')).toHaveLength(0);
  await page.getByRole('radio', { name: /Chọn gợi ý của shop/ }).check();
  await expect(page.getByText('Shop chưa có địa điểm gợi ý.', { exact: false })).toBeVisible();
  await page.getByRole('radio', { name: /Tự chọn địa điểm/ }).check();
  await page.locator('#customPickupLocation').fill('Thư viện');
  await submit(page);
  await expect(page).toHaveURL('/order-success');
});

test('seller confirms customer destination with no shop suggestions', async ({ page, scenario }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T02:00:00Z'));
  await scenario.authenticate('SELLER');
  scenario.shop.pickupPoints = [];
  scenario.order.pickupPointId = null;
  scenario.order.pickupPointName = 'Sảnh nhà B';
  scenario.order.pickupInstructions = 'Ghế đá số 3';
  await page.goto(`/seller/orders/${ids.order}`);
  await expect(page.locator('.buyer-info-grid')).toContainText('Sảnh nhà B');
  await expect(page.locator('.buyer-info-grid')).toContainText('Ghế đá số 3');
  await page.getByRole('button', { name: /Ghi nhận liên hệ/ }).click();
  await page.getByRole('button', { name: 'Lưu liên hệ', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xác nhận đơn hàng', exact: true }).click();
  await expect(page.locator('#sellerorderdetailpage-field-4')).toHaveValue('KEEP_REQUESTED');
  await expect(page.getByRole('dialog')).toContainText('Ghế đá số 3');
  await page.getByRole('button', { name: 'Ngày mai', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận và gửi email', exact: true }).click();
  await expectMutation(scenario, '/accept', { expectedVersion: 8 });
  expect(scenario.mutations('/accept')[0].postDataJSON()).not.toHaveProperty('confirmedPickupPointId');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.buyer-info-grid')).toContainText('Sảnh nhà B');
});
