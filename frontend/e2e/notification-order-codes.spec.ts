import { test, expect, ids, submit } from './fixtures';

const shortCode = 'ORD-8K3M7P2Q';
const legacyCode = 'ORD-0123456789ABCDEF';

for (const width of [1280, 320]) {
  test(`dashboard identifies orders, copies complete codes and opens the correct order at ${width}px`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await scenario.authenticate('SELLER');
    scenario.order.orderCode = shortCode;
    scenario.notifications = [shortCode, legacyCode].map((orderCode, index) => ({
      id: `notification-${index}`, recipientProfileId: ids.user, type: 'ORDER_CREATED',
      orderId: ids.order, orderCode, buyerName: index === 0 ? 'Khách mới' : 'Khách cũ',
      orderTotal: 35000, isRead: false, createdAt: new Date().toISOString(),
    }));
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async (value: string) => { localStorage.setItem('test-copied-code', value); },
    } }));
    await page.goto('/seller');
    const cards = page.locator('.notifications-list .notification-item');
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator('.notification-order-code')).toHaveText(shortCode);
    await expect(cards.first().locator('.readable-order-code > span')).toHaveCount(3);
    await expect(cards.last().locator('.notification-order-code')).toHaveText(legacyCode);
    await expect(cards.last().locator('.readable-order-code > span')).toHaveCount(5);
    await expect(page.locator('.notifications-list')).not.toContainText('Tạo đơn hàng');
    await expect(cards.first()).toContainText('Khách mới');
    await expect(cards.first()).toContainText('35.000 đ');
    for (const [index, value] of [shortCode, legacyCode].entries()) {
      await cards.nth(index).getByRole('button', { name: 'Sao chép mã đơn hàng', exact: true }).click();
      expect(await page.evaluate(() => localStorage.getItem('test-copied-code'))).toBe(value);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.notifications-list').screenshot({ path: testInfo.outputPath(`notification-order-codes-${width}.png`), animations: 'disabled' });
    await cards.last().getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thông báo mới (1)', exact: true })).toBeVisible();
    await expect(cards.last()).toContainText('Đã đọc');
    await cards.first().getByRole('link', { name: 'Xem đơn hàng', exact: true }).click();
    await expect(page).toHaveURL(`/seller/orders/${ids.order}`);
    await expect(page.locator('h1 .readable-order-code')).toHaveText(shortCode);
    await expect(page.locator('h1 .readable-order-code > span')).toHaveCount(3);
    await page.goto('/seller/orders');
    await page.getByLabel('Tìm theo mã đơn').fill('ord-8k3m 7p2q');
    await expect.poll(() => scenario.calls.some(request => new URL(request.url()).searchParams.get('orderCode') === shortCode)).toBe(true);
  });
}

test('guest can look up a short grouped code and payment keeps its complete code', async ({ page, scenario }) => {
  scenario.order.orderCode = shortCode;
  scenario.order.status = 'ACCEPTED';
  scenario.order.paymentMethod = 'BANK_TRANSFER';
  await page.goto('/guest-order');
  await page.locator('#orderCode').fill('ord-8k3m 7p2q');
  await page.locator('input[type="password"]').fill('secret-test-token');
  await submit(page);
  await expect(page.locator('h1 .readable-order-code')).toHaveText(shortCode);
  expect(scenario.mutations('/guest/orders/access')[0].postDataJSON()).toMatchObject({ orderCode: shortCode });
  await expect(page.locator('main')).toContainText(shortCode);
  await expect.poll(() => scenario.calls.some(request => request.url().includes('/payment-instructions'))).toBe(true);
});
