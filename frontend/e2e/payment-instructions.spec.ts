import { test, expect, ids, expectMutation } from './fixtures';

for (const actor of ['guest', 'customer'] as const) {
  test(`${actor} cash order never requests bank transfer instructions`, async ({ page, scenario }) => {
    scenario.order.paymentMethod = 'CASH';
    if (actor === 'customer') {
      await scenario.authenticate('CUSTOMER');
      await page.goto(`/account/orders/${ids.order}`);
    } else {
      await page.goto('/guest-order');
      await page.locator('#orderCode').fill(scenario.order.orderCode);
      await page.locator('#guestToken').fill('fixture-guest-token');
      await page.getByRole('button', { name: 'Tra cứu đơn hàng', exact: true }).click();
    }
    await expect(page.locator('.header-status-badges')).toContainText('Chưa thanh toán');
    await expect(page.locator('.payment-method-desc')).toContainText('Tiền mặt');
    expect(scenario.calls.filter(request => new URL(request.url()).pathname.endsWith('/payment-instructions'))).toHaveLength(0);
    await expect(page.locator('.payment-instructions-panel')).toHaveCount(0);
  });
}

for (const actor of ['guest', 'customer'] as const) {
  test(`${actor} sees bank account at checkout and reports transfer before shop accepts`, async ({ page, scenario }) => {
    if (actor === 'customer') await scenario.authenticate('CUSTOMER');
    await scenario.cart();
    await page.goto('/checkout');
    await page.getByRole('radio', { name: 'Chuyển khoản' }).check();
    const bank = page.locator('.payment-instructions-panel');
    await expect(bank).toContainText('Demo Bank');
    await expect(bank).toContainText('123456');
    await expect(bank).toContainText('DEMO SHOP');
    await expect(bank).toContainText('10.000 đ');
    await page.locator('#fullName').fill('Khách Test');
    await page.locator('#phone').fill('0912345678');
    await page.locator('#email').fill('buyer@example.com');
    await page.locator('#customPickupLocation').fill('Cổng trường');
    await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
    await expect(page).toHaveURL('/order-success');
    await expect(bank).toContainText('123456');
    await expect(bank).toContainText(scenario.order.orderCode);
    await expect(page.locator('.next-steps-card')).toContainText('Shop sẽ kiểm tra tiền và xác nhận đơn hàng sau');
    await page.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true }).click();
    await expectMutation(scenario, '/payment-report', { expectedVersion: 7 });
    await expect(page.locator('.order-summary-box')).toContainText('Đã báo chuyển khoản');
    await expect(page.locator('.next-steps-card')).toContainText('Đơn hàng chờ shop kiểm tra tiền và xác nhận');
    expect(scenario.order.status).toBe('PENDING_CONTACT');
    expect(scenario.order.paymentStatus).toBe('REPORTED');
    expect(scenario.order.receivedAmount).toBe(0);
    await expect(page.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true })).toHaveCount(0);
  });

  test(`${actor} can report transfer on an existing pending order`, async ({ page, scenario }) => {
    scenario.order.paymentMethod = 'BANK_TRANSFER';
    if (actor === 'customer') {
      await scenario.authenticate('CUSTOMER');
      await page.goto(`/account/orders/${ids.order}`);
    } else {
      await page.goto('/guest-order');
      await page.locator('#orderCode').fill(scenario.order.orderCode);
      await page.locator('#guestToken').fill('fixture-guest-token');
      await page.getByRole('button', { name: 'Tra cứu đơn hàng', exact: true }).click();
    }
    await expect(page.locator('.bank-details-list')).toContainText('123456');
    await expect(page.locator('.bank-transfer-box')).not.toContainText('không chuyển tiền trước');
    await page.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true }).click();
    await expectMutation(scenario, '/payment-report', { expectedVersion: 7 });
    await expect(page.locator('.header-status-badges')).toContainText('Đã báo chuyển khoản');
    expect(scenario.order.status).toBe('PENDING_CONTACT');
  });
}
