import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';

// This suite exercises taps even when selected by the desktop project.
test.use({ hasTouch: true });

async function touchTarget(control: Locator) {
  const box = (await control.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
}

for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
  test(`catalog controls are readable and tappable at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#catalog');
    const search = page.getByRole('searchbox', { name: 'Tìm món trong gian hàng' });
    const sort = page.getByRole('combobox', { name: 'Sắp xếp sản phẩm' });
    await expect(search).toHaveCSS('font-size', '16px');
    await expect(sort).toHaveCSS('font-size', '16px');
    await touchTarget(search);
    await touchTarget(sort);
    await touchTarget(page.getByRole('button', { name: 'Đồ ăn vặt', exact: true }));
    await touchTarget(page.getByRole('button', { name: 'Thêm Bánh thử vào giỏ', exact: true }));
    await touchTarget(page.getByRole('button', { name: 'Hỏi về Bánh thử', exact: true }));
    await search.fill('Bánh');
    const clear = page.getByRole('button', { name: 'Xóa từ khóa tìm kiếm' });
    await touchTarget(clear);
    await clear.tap();
    await expect(search).toHaveValue('');
    await sort.selectOption('price,asc');
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({ path: testInfo.outputPath(`catalog-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const launcher = page.getByRole('button', { name: 'Chat với gian hàng', exact: true });
    await touchTarget(launcher);
    if (width <= 640) {
      const box = (await launcher.boundingBox())!;
      expect(box.width).toBe(52);
      await launcher.tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Để sau', exact: true }).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}

for (const width of [320, 390]) {
  test(`checkout keeps typing and totals clear at ${width}px`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    await scenario.cart();
    await page.goto('/checkout');
    const input = page.getByRole('textbox', { name: 'Họ và tên', exact: false });
    await expect(input).toHaveCSS('font-size', '16px');
    await input.tap();
    await page.setViewportSize({ width, height: 380 });
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
    await expect(page.locator('.chat-launcher')).toBeHidden();
    await input.fill('Nguyễn Thị Người Mua');
    await page.screenshot({ path: testInfo.outputPath(`checkout-typing-${width}.png`) });
    await input.evaluate(element => (element as HTMLElement).blur());
    await page.setViewportSize({ width, height: 700 });
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    await expect(page.locator('.chat-launcher')).toBeVisible();
    const amount = page.locator('.quote-total-amount');
    await expect(amount).toHaveText('10.000 đ');
    await expect(amount).toHaveCSS('white-space', 'nowrap');
    const row = page.locator('.quote-total-row');
    await row.scrollIntoViewIfNeeded();
    const bounds = (await amount.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`checkout-total-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
