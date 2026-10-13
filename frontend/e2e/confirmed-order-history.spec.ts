import { test, expect, ids } from './fixtures';
import type { ConfirmedOrderHistoryItem } from '../src/types/api';

test.use({ timezoneId: 'America/Los_Angeles' });

const orders: ConfirmedOrderHistoryItem[] = [
  { id: ids.order, orderCode: 'ORD-8K3M7P2Q', buyerName: 'Nguyễn Minh Anh', buyerPhone: '0912345678',
    pickupPointName: 'Sảnh nhà B', pickupAt: '2026-10-15T03:30:00Z', acceptedAt: '2026-10-13T03:00:00Z',
    acceptedBy: 'Thanh Diệu', total: 10000, paymentStatus: 'PAID', status: 'ACCEPTED' },
  { id: '00000000-0000-4000-8000-000000000099', orderCode: 'ORD-ABCDEF1234567890', buyerName: 'Khách có tên dài '.repeat(5),
    buyerPhone: '0987654321', pickupPointName: 'Địa điểm khách chọn '.repeat(10),
    pickupAt: '2026-10-16T03:30:00Z', acceptedAt: '2026-10-12T03:00:00Z', acceptedBy: null,
    total: 25000, paymentStatus: 'UNPAID', status: 'COMPLETED' },
];
const result = (content = orders, extra = {}) => ({ content, page: 0, size: 20,
  totalElements: content.length, totalPages: content.length ? 1 : 0,
  summary: { totalValue: 35000, paidValue: 10000 }, ...extra });

for (const width of [1440, 768, 390, 320]) {
  test(`confirmed order history, filters and summary are usable at ${width}px`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-13T03:00:00Z'));
    await scenario.authenticate('SELLER');
    await page.route('**/api/v1/seller/confirmed-orders**', route => {
      const params = new URL(route.request().url()).searchParams;
      return route.fulfill({ json: params.has('orderCode') || params.has('date')
        ? result([orders[0]], { summary: { totalValue: 10000, paidValue: 10000 } }) : result() });
    });
    await page.goto('/seller/logs');
    await expect(page.getByRole('button', { name: 'Tất cả hoạt động', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.logs-table')).toContainText('Tạo đơn hàng');
    await page.getByRole('button', { name: 'Đơn đã xác nhận', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Đơn đã xác nhận', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const history = page.getByRole('region', { name: 'Lịch sử đơn đã xác nhận', exact: true });
    await expect(history.locator('tbody tr')).toHaveCount(2);
    await expect(history.locator('.readable-order-code').first()).toHaveText('ORD-8K3M7P2Q');
    await expect(history.locator('.readable-order-code').last()).toHaveText('ORD-ABCDEF1234567890');
    await expect(history.getByRole('link', { name: 'Xem đơn ORD-8K3M7P2Q', exact: true })).toHaveAttribute('href', `/seller/orders/${ids.order}`);
    await expect(history.locator('time[datetime="2026-10-13T03:00:00Z"]')).toContainText('10:00');
    await expect(history.locator('time[datetime="2026-10-15T03:30:00Z"]')).toContainText('10:30');
    await expect(history).toContainText('Thanh Diệu');
    await expect(history).not.toContainText('Tạo đơn hàng');
    await expect(history.locator('.confirmed-history-summary')).toContainText('35.000 đ');
    await expect(history.locator('.confirmed-history-summary')).toContainText('10.000 đ');
    for (const card of await history.locator('.confirmed-history-summary > .card').all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveCSS('opacity', '1');
    }
    await history.locator('.confirmed-history-table').scrollIntoViewIfNeeded();
    await expect(history.locator('.card').last()).toHaveCSS('opacity', '1');
    const layout = await history.evaluate(el => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      clipped: [...el.querySelectorAll('td, dd')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent),
    }));
    expect(layout).toEqual({ overflow: false, clipped: [] });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`confirmed-history-${width}.png`), fullPage: true });

    const searched = page.waitForRequest(req => new URL(req.url()).searchParams.get('orderCode') === 'ORD-8K3M7P2Q');
    await page.getByLabel('Tìm mã đơn đã xác nhận').fill('ord-8k3m 7p2q');
    await searched;
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history.locator('.confirmed-history-summary dt').filter({ hasText: 'Tổng giá trị đơn' }).locator('..')).toContainText('10.000 đ');
    await history.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    await expect(history.locator('tbody tr')).toHaveCount(2);
    await page.getByLabel('Ngày xác nhận đơn').click();
    const dateRequest = page.waitForRequest(req => new URL(req.url()).searchParams.get('date') === '2026-10-13');
    await page.locator('[data-date="2026-10-13"]').click();
    await dateRequest;
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await history.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    await expect(history.locator('tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Tất cả hoạt động', exact: true }).click();
    await expect(page.locator('.logs-table')).toContainText('Tạo đơn hàng');
    await expect(page.getByLabel('Lọc theo hành động')).toBeVisible();
  });
}

test('pagination preserves totals across all matching orders and searching resets the page', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.route('**/api/v1/seller/confirmed-orders**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('orderCode')) return route.fulfill({ json: result([orders[0]]) });
    const currentPage = Number(params.get('page'));
    const content = currentPage === 0 ? Array.from({ length: 20 }, (_, index) => ({ ...orders[0], id: `order-${index}`, orderCode: `ORD-PAGE${index}` })) : [orders[1]];
    return route.fulfill({ json: result(content, { page: currentPage, totalElements: 21, totalPages: 2,
      summary: { totalValue: 225000, paidValue: 200000 } }) });
  });
  await page.goto('/seller/logs');
  await page.getByRole('button', { name: 'Đơn đã xác nhận', exact: true }).click();
  const summary = page.locator('.confirmed-history-summary');
  await expect(summary).toContainText('225.000 đ');
  await expect(page.getByRole('button', { name: 'Trang trước', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.locator('.pagination-info')).toHaveText('Trang 2 / 2');
  await expect(page.locator('.confirmed-history-table tbody tr')).toHaveCount(1);
  await expect(summary).toContainText('225.000 đ');
  await expect(page.getByRole('button', { name: 'Trang sau', exact: true })).toBeDisabled();
  const searched = page.waitForRequest(req => {
    const params = new URL(req.url()).searchParams;
    return params.get('orderCode') === 'ORD-8K3M7P2Q' && params.get('page') === '0';
  });
  await page.getByLabel('Tìm mã đơn đã xác nhận').fill('ORD-8K3M7P2Q');
  await searched;
  await expect(page.locator('.pagination-controls')).toHaveCount(0);
});

test('empty history and failed requests have clear recovery states', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  let fail = true;
  await page.route('**/api/v1/seller/confirmed-orders**', route => fail
    ? route.fulfill({ status: 400, json: { code: 'INVALID_DATE', message: 'Ngày không hợp lệ.' } })
    : route.fulfill({ json: result([], { summary: { totalValue: 0, paidValue: 0 } }) }));
  await page.goto('/seller/logs');
  await page.getByRole('button', { name: 'Đơn đã xác nhận', exact: true }).click();
  await expect(page.locator('.confirmed-order-history .error-box')).toBeVisible();
  await expect(page.locator('.confirmed-history-summary')).toHaveCount(0);
  fail = false;
  await page.locator('.confirmed-order-history').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByText('Chưa có đơn đã xác nhận', { exact: true })).toBeVisible();
  await expect(page.locator('.confirmed-history-summary')).toContainText('0 đ');
  await expect(page.locator('.confirmed-history-table')).toHaveCount(0);
});
