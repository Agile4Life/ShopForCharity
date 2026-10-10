import { test, expect, expectMutation, ids } from './fixtures';

test('pickup form keeps input focus while typing', async ({ page, scenario }, testInfo) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('Tên điểm nhận hàng', { exact: false });
  await expect(name).toBeFocused();
  await name.pressSequentially('Cong thu vien truong', { delay: 20 });
  await expect(name).toHaveValue('Cong thu vien truong');
  await expect(name).toBeFocused();
  await name.press('End');
  await name.press('Backspace');
  await name.press('g');
  await expect(name).toHaveValue('Cong thu vien truong');
  const instructions = dialog.getByLabel('Chỉ dẫn nhận hàng', { exact: false });
  await instructions.pressSequentially('Gio ra choi', { delay: 20 });
  await instructions.press('Enter');
  await page.keyboard.insertText('Gần ghế đá số 3.');
  await expect(instructions).toHaveValue('Gio ra choi\nGần ghế đá số 3.');
  await expect(instructions).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('pickup-form.png') });
});

test('pickup validates whitespace, saves trimmed Vietnamese text and updates list', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('Tên điểm nhận hàng', { exact: false });
  await name.fill('   ');
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Vui lòng nhập tên');
  await expect(name).toBeFocused();
  expect(scenario.mutations('/seller/pickup-points')).toHaveLength(0);
  await name.fill('  Sảnh nhà B  ');
  await dialog.getByLabel('Chỉ dẫn nhận hàng', { exact: false }).fill('  Gần ghế đá số 3.\nNhận vào giờ ra chơi.  ');
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expectMutation(scenario, '/seller/pickup-points', {
    name: 'Sảnh nhà B', instructions: 'Gần ghế đá số 3.\nNhận vào giờ ra chơi.', active: true,
  });
  await expect(page.locator('.pickup-point-item').filter({ hasText: 'Sảnh nhà B' })).toBeVisible();
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm điểm nhận hàng');
  expect(scenario.mutations('/seller/shop-settings')).toHaveLength(0);
});

test('pending save blocks duplicates and closing; failure keeps values for retry', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('Tên điểm nhận hàng', { exact: false });
  await name.fill('Cổng thư viện');
  await dialog.getByLabel('Chỉ dẫn nhận hàng', { exact: false }).fill('Nhận lúc 10 giờ');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  const path = '**/api/v1/seller/pickup-points';
  await page.route(path, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    writes++;
    await gate;
    await route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Chưa lưu được điểm nhận. Thử lại nhé.' } });
  });
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Đang lưu…', exact: true })).toBeDisabled();
  await expect(name).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Đóng', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.locator('form').dispatchEvent('submit');
  await expect.poll(() => writes).toBe(1);
  release();
  await expect(dialog.getByRole('alert')).toContainText('Dịch vụ đang gặp sự cố');
  await expect(name).toHaveValue('Cổng thư viện');
  await expect(dialog.getByLabel('Chỉ dẫn nhận hàng', { exact: false })).toHaveValue('Nhận lúc 10 giờ');
  await page.unroute(path);
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.pickup-point-item').filter({ hasText: 'Cổng thư viện' })).toBeVisible();
});

test('cancel clears draft, Escape restores focus, Tab stays in dialog', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  const opener = page.getByRole('button', { name: 'Thêm điểm nhận', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên điểm nhận hàng', { exact: false }).fill('Chưa lưu');
  await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Đóng', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByLabel('Tên điểm nhận hàng', { exact: false })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(scenario.mutations('/seller/pickup-points')).toHaveLength(0);
});

test('empty state and small viewport keep form and actions reachable without horizontal overflow', async ({ page, scenario }, testInfo) => {
  await scenario.authenticate('SELLER');
  scenario.shop.pickupPoints = [];
  await page.setViewportSize({ width: 360, height: 480 });
  await page.goto('/seller/settings');
  await expect(page.getByText('Chưa có điểm nhận hàng', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('Tên điểm nhận hàng', { exact: false });
  await name.fill('Sảnh nhà B');
  const save = dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true });
  await save.scrollIntoViewIfNeeded();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(480);
  const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.right > innerWidth + 1;
    }).slice(0, 12).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })) }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pickup-small-viewport.png') });
  await save.click();
  await expect(dialog).toHaveCount(0);
});

test('pickup activation uses version and disables controls while saving', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/settings');
  const row = page.locator('.pickup-point-item').filter({ hasText: 'Cổng trường' });
  await row.getByRole('button', { name: 'Đang hoạt động', exact: true }).click();
  await expectMutation(scenario, `/seller/pickup-points/${ids.pickup}`, { active: false, expectedVersion: 5 });
  await expect(row.getByRole('button', { name: 'Tạm ẩn', exact: true })).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.feedback-notice')).toContainText('Đã ẩn điểm nhận hàng');
});
