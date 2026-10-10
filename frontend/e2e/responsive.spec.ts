import { test, expect, ids, submit, type Scenario } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';

const screens = [
  [320, 568], [360, 640], [390, 844], [480, 800], [600, 960],
  [768, 1024], [820, 1180], [844, 390], [1024, 600], [1280, 800], [1440, 900], [1920, 1080],
].filter(([width]) => !process.env.RWD_WIDTHS || process.env.RWD_WIDTHS.split(',').includes(String(width)));

async function inspect(page: Page, testInfo: TestInfo, label: string) {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main .loading-container')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const outside = [...document.querySelectorAll<HTMLElement>('main *, header *, footer *')].filter(el => {
      if (el.closest('svg, [hidden], .skip-link')) return false;
      const closedDetails = el.closest('details:not([open])');
      if (closedDetails && el !== closedDetails && !el.closest('summary')) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') return false;
      if (el.closest('.table-responsive, .seller-workspace-bar nav, .category-tabs')) return false;
      return rect.left < -1 || rect.right > width + 1;
    }).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, text: el.innerText?.slice(0, 65), left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }));
    return { width, documentWidth: document.documentElement.scrollWidth, outside };
  });
  await testInfo.attach(label, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  if (result.outside.length || result.documentWidth > result.width + 1 || [320, 768, 1440].includes(page.viewportSize()!.width)) {
    await page.screenshot({ path: testInfo.outputPath(`${label}.png`), fullPage: true });
  }
  return result;
}

async function routes(page: Page, scenario: Scenario, testInfo: TestInfo, paths: string[]) {
  const issues: unknown[] = [];
  let menuChecked = false;
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('main h1, main h2')).not.toHaveCount(0);
    await expect.poll(() => scenario.calls.filter(r => r.method() === 'GET').length).toBeGreaterThan(0);
    const result = await inspect(page, testInfo, path.replaceAll('/', '_') || 'home');
    if (result.documentWidth > result.width + 1 || result.outside.length) issues.push({ path, ...result });
    const menu = page.locator('.account-dropdown > summary');
    if (!menuChecked && await menu.count()) {
      await menu.click();
      const panel = page.locator('.account-dropdown-panel');
      await expect(panel).toBeVisible();
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(result.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      menuChecked = true;
    }
  }
  expect(issues, 'Content must fit without page-wide horizontal scrolling or clipped controls').toEqual([]);
}

for (const [width, height] of screens) {
  test(`public catalog, auth, cart and checkout fit ${width}x${height}`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height });
    await scenario.cart();
    await routes(page, scenario, testInfo, ['/', '/products/banh-thu', '/combos/combo-thu', '/cart', '/checkout', '/guest-order', '/login', '/register', '/forgot-password']);
    await page.goto('/checkout');
    await page.locator('#fullName').fill('Responsive customer');
    await page.locator('#phone').fill('0912345678');
    await page.locator('#email').fill('responsive@example.com');
    await page.locator('input[value="BANK_TRANSFER"]').check();
    await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
    await submit(page);
    await expect(page).toHaveURL('/order-success');
    const success = await inspect(page, testInfo, 'order-success');
    expect(success.documentWidth).toBeLessThanOrEqual(success.width + 1);
    expect(success.outside).toEqual([]);
    await page.getByRole('link', { name: 'Xem đơn hàng', exact: false }).click();
    await submit(page);
    await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
    const guest = await inspect(page, testInfo, 'guest-order-detail');
    expect(guest.documentWidth).toBeLessThanOrEqual(guest.width + 1);
    expect(guest.outside).toEqual([]);
  });

  test(`customer profile and order details fit ${width}x${height}`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height });
    await scenario.authenticate('CUSTOMER');
    scenario.order.buyerName = 'Nguyễn Thị Người Mua Có Tên Dài Để Kiểm Tra Giao Diện';
    scenario.order.buyerEmail = 'khachhang.co.diachi.email.dai@example.com';
    scenario.order.status = 'ACCEPTED';
    scenario.order.paymentMethod = 'BANK_TRANSFER';
    await routes(page, scenario, testInfo, ['/account/profile', '/account/orders', `/account/orders/${ids.order}`]);
  });

  test(`seller management, forms and order actions fit ${width}x${height}`, async ({ page, scenario }, testInfo) => {
    await page.setViewportSize({ width, height });
    await scenario.authenticate('SELLER');
    await routes(page, scenario, testInfo, ['/seller', '/seller/products', '/seller/products/new', `/seller/products/${ids.product}/edit`, '/seller/combos', '/seller/combos/new', `/seller/combos/${ids.combo}/edit`, '/seller/orders', `/seller/orders/${ids.order}`, '/seller/settings', '/seller/logs']);
    await page.goto('/seller/settings');
    await page.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.height).toBeLessThanOrEqual(height);
    await dialog.getByLabel('Tên điểm nhận hàng', { exact: false }).fill('Điểm nhận kiểm tra responsive');
    await dialog.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}
