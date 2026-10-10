import { test, expect } from './fixtures';

test('account dropdown supports keyboard, dismissal, and seller navigation', async ({ page, scenario }, testInfo) => {
  await scenario.authenticate('SELLER');
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Menu tài khoản', exact: true });
  const panel = page.getByRole('navigation', { name: 'Điều hướng tài khoản', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('account-menu.png') });
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('link', { name: 'Thông tin tài khoản' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('main').click({ position: { x: 10, y: 10 } });
  await expect(panel).toBeHidden();
  await trigger.click();
  await panel.getByRole('link', { name: 'Bàn làm việc' }).click();
  await expect(page).toHaveURL('/seller');
  await expect(panel).toBeHidden();
});

test('select picker supports keyboard selection and escape', async ({ page }, testInfo) => {
  await page.goto('/');
  const select = page.getByRole('combobox', { name: 'Sắp xếp sản phẩm' });
  await select.scrollIntoViewIfNeeded();
  await select.focus();
  const customPicker = await page.evaluate(() => CSS.supports('appearance', 'base-select'));
  if (customPicker) await select.press('Space');
  await page.screenshot({ path: testInfo.outputPath('select-picker.png') });
  await expect(select).toHaveJSProperty('value', '');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(customPicker ? 'Enter' : 'Tab');
  await expect(select).toHaveValue('price,asc');
  await select.focus();
  await select.press('Space');
  await page.keyboard.press('Escape');
  await expect(select).toBeFocused();
  await expect(select).toHaveValue('price,asc');
});
