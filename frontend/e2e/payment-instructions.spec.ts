import { test, expect, ids } from './fixtures';

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
