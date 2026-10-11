import { test, expect, ids } from './fixtures';

for (const width of [1440, 768, 390, 320]) {
  test(`seller logs are readable at ${width}px`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await scenario.authenticate('SELLER');
    const entries = [
      { action: 'ORDER_CREATED', entityType: 'ORDER', safeAfter: '{"total":35000}' },
      { action: 'PAYMENT_SETTINGS_VERSION_CREATED', entityType: 'PAYMENT_SETTINGS' },
      { action: 'SHOP_SETTINGS_UPDATED', entityType: 'SHOP', safeAfter: '{"acceptingOrders":true}' },
      { action: 'CONTACT_RECORDED', entityType: 'ORDER', safeAfter: '{"outcome":"SUCCESS"}' },
      { action: 'FUTURE_ACTION', entityType: 'PRODUCT', safeAfter: 'Chi tiết chưa theo định dạng JSON' },
    ];
    await page.route('**/api/v1/seller/audit-logs**', route => route.fulfill({ json: {
      content: entries.map((entry, index) => ({ ...entry, id: `log-${index}`, actorType: 'SELLER',
        entityId: ids.order, requestId: 'f62aa949-full-request-id', createdAt: '2026-10-10T09:32:35Z' })),
      page: 0, totalPages: 1, totalElements: entries.length, size: 20,
    } }));
    await page.goto('/seller/logs');
    const table = page.locator('.logs-table');
    await expect(table).toContainText('Tạo đơn hàng');
    await expect(table).toContainText('Cập nhật thiết lập thanh toán');
    await expect(table).toContainText('Người bán');
    await expect(table).toContainText(/Tổng tiền: 35\.000\s*₫/);
    await expect(table).toContainText('Nhận đơn: Có');
    await expect(table).toContainText('Kết quả liên hệ: Thành công');
    await expect(table).toContainText('Hoạt động khác');
    await expect(table).not.toContainText('FUTURE_ACTION');
    await expect(table).toContainText('Chi tiết chưa theo định dạng JSON');
    await expect(table).not.toContainText('{"total"');
    const layout = await table.evaluate(el => ({
      width: innerWidth, pageWidth: document.documentElement.scrollWidth,
      clipped: [...el.querySelectorAll('td, .audit-details')].filter(node => node.scrollWidth > node.clientWidth + 1)
        .map(node => node.textContent),
    }));
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.clipped).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`logs-${width}.png`), fullPage: true });
    const request = page.waitForRequest(req => req.url().includes('/seller/audit-logs') && req.url().includes('action=ORDER_CREATED'));
    await page.getByLabel('Lọc theo hành động').selectOption('ORDER_CREATED');
    await request;
    await expect(page.getByLabel('Lọc theo hành động')).toHaveValue('ORDER_CREATED');
  });
}
