import { test, expect, ids, submit } from './fixtures';

test.use({ timezoneId: 'America/Los_Angeles' });

for (const width of [1280, 390, 320]) {
  test(`custom date, month and year picker fits ${width}px`, async ({ page, scenario }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-10T02:00:00Z'));
    await page.setViewportSize({ width, height: 900 });
    await scenario.authenticate('SELLER');
    await page.goto('/seller/logs');
    await page.getByLabel('Ngày ghi nhật ký').click();
    const calendar = page.getByRole('group', { name: 'Lịch chọn ngày', exact: true });
    await calendar.getByRole('button', { name: 'Chọn năm', exact: true }).click();
    await calendar.getByRole('button', { name: '2025', exact: true }).click();
    await calendar.getByRole('button', { name: 'Tháng 2', exact: true }).click();
    await expect(calendar.locator('[data-date]')).toHaveCount(28);
    await calendar.getByRole('button', { name: 'Chọn tháng', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`calendar-month-${width}.png`), fullPage: true });
    await calendar.getByRole('button', { name: 'Tháng 3', exact: true }).click();
    const request = page.waitForRequest(req => req.url().includes('date=2025-03-15'));
    await calendar.locator('[data-date="2025-03-15"]').click();
    await request;
    await expect(page.getByLabel('Ngày ghi nhật ký')).toContainText('15 tháng 3, 2025');
    await page.getByLabel('Ngày ghi nhật ký').click();
    await expect(calendar.locator('[data-date="2025-03-15"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Xóa ngày', exact: true }).click();
    await expect(page.getByLabel('Ngày ghi nhật ký')).toContainText('Tất cả ngày');
    await page.getByLabel('Ngày ghi nhật ký').click();
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(page.getByLabel('Ngày ghi nhật ký')).toBeFocused();
    await expect(page.locator('input[type="date"], input[type="datetime-local"]')).toHaveCount(0);
  });
}

test('checkout shows note field without class or pickup time fields', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/checkout');
  await expect(page.locator('#className')).toHaveCount(0);
  await expect(page.locator('#requestedPickupAt')).toHaveCount(0);
  await expect(page.locator('#note')).toBeVisible();
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#pickupPointId').selectOption(ids.pickup);
  await page.locator('#note').fill('Em nhận vào giờ ra chơi tiết 2 ạ');
  await submit(page);
  await expect(page).toHaveURL('/order-success');
  expect(scenario.mutations('/orders')[0].postDataJSON()).toMatchObject({
    note: 'Em nhận vào giờ ra chơi tiết 2 ạ',
  });
});
