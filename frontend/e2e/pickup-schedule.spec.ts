import { test, expect, ids, expectMutation } from './fixtures';

test.use({ timezoneId: 'America/Los_Angeles' });
test.beforeEach(async ({ page, scenario }) => {
  await page.clock.setFixedTime(new Date('2026-10-10T02:00:00Z'));
  await scenario.authenticate('SELLER');
  await page.goto(`/seller/orders/${ids.order}`);
  await page.getByRole('button', { name: /Ghi nhận liên hệ/ }).click();
  await page.getByRole('button', { name: 'Lưu liên hệ', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chấp nhận đơn hàng', exact: true }).click();
  await expect(page.locator('#sellerorderdetailpage-field-4')).toHaveValue(ids.pickup);
  await page.locator('#sellerorderdetailpage-field-4').selectOption(ids.pickup);
});

test('chooses date and 24-hour time, submits Vietnam time regardless of device timezone', async ({ page, scenario }) => {
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tháng trước', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Thứ Sáu, 9 tháng 10, 2026', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ngày mai', exact: true }).click();
  await page.getByLabel('Giờ', { exact: true }).selectOption('10');
  await page.getByLabel('Phút', { exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expectMutation(scenario, '/accept', {
    expectedVersion: 8, confirmedPickupPointId: ids.pickup, confirmedPickupAt: '2026-10-11T03:30:00.000Z',
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('shows inline validation for missing date and elapsed time, allows correction', async ({ page, scenario }) => {
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Vui lòng chọn');
  await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await page.getByLabel('Giờ', { exact: true }).selectOption('08');
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Giờ hẹn đã qua');
  expect(scenario.mutations('/accept')).toHaveLength(0);
  await page.getByLabel('Giờ', { exact: true }).selectOption('10');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expectMutation(scenario, '/accept', { confirmedPickupAt: '2026-10-10T03:00:00.000Z' });
});

test('navigates across month boundary using arrow keys', async ({ page, scenario }) => {
  const last = page.getByRole('button', { name: /31 tháng 10, 2026/ });
  await last.focus();
  await last.press('ArrowRight');
  const next = page.getByRole('button', { name: 'Chủ Nhật, 1 tháng 11, 2026', exact: true });
  await expect(next).toBeFocused();
  await next.press('Enter');
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expectMutation(scenario, '/accept', { confirmedPickupAt: '2026-11-01T02:00:00.000Z' });
});

test('calendar and footer remain usable on a short phone viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 480 });
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('calendar-small.png') });
  await page.getByRole('button', { name: /11 tháng 10, 2026/ }).click();
  await page.getByLabel('Giờ', { exact: true }).selectOption('17');
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('calendar matches the shop on desktop and mobile', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop-chromium') await page.setViewportSize({ width: 1280, height: 960 });
  await page.getByRole('button', { name: 'Tháng sau', exact: true }).click();
  await expect(page.getByText('Tháng 11, 2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tháng trước', exact: true }).click();
  await page.locator('.pickup-schedule-dialog .modal-body').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('pickup-schedule.png') });
  await page.getByRole('button', { name: /12 tháng 10, 2026/ }).click();
  await expect(page.locator('.pickup-date-trigger')).toContainText('12 tháng 10, 2026');
  await expect(page.locator('.pickup-calendar')).toHaveCount(0);
  await page.locator('.pickup-date-trigger').click();
  await expect(page.locator('.pickup-calendar').getByRole('button', { name: /12 tháng 10, 2026/ })).toHaveAttribute('aria-pressed', 'true');
});

test('shows loading and protects the form until acceptance finishes', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/seller/orders/*/accept', async route => { await gate; await route.fallback(); });
  await page.getByRole('button', { name: 'Ngày mai', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang xác nhận…', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Giờ', { exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).first()).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
