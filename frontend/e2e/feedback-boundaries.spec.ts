import { test, expect, ids } from './fixtures';

for (const response of ['empty-json', 'null-json', 'html'] as const) {
  test(`unconfirmed order ${response} keeps cart and same retry key`, async ({ page, scenario }) => {
    await scenario.cart();
    await page.goto('/checkout');
    await page.locator('#fullName').fill('Nguyễn Văn Test');
    await page.locator('#phone').fill('0912345678');
    await page.locator('#email').fill('test@example.com');
    const submit = page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true });
    await expect(submit).toBeEnabled();
    const keys: string[] = [];
    await page.route('**/api/v1/orders', async route => {
      keys.push(route.request().headers()['idempotency-key']);
      if (keys.length > 1) return route.fallback();
      if (response === 'html') return route.fulfill({ contentType: 'text/html', body: '<html>ServerException hidden trace</html>' });
      return route.fulfill({ contentType: 'application/json', body: response === 'null-json' ? 'null' : '{}' });
    });
    await submit.click();
    await expect(page.locator('main .error-box')).toContainText('Chưa xác nhận được kết quả');
    await expect(page).toHaveURL('/checkout');
    await expect(page.locator('#fullName')).toHaveValue('Nguyễn Văn Test');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!).length)).toBe(1);
    await expect(page.locator('body')).not.toContainText('hidden trace');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL('/order-success');
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
}

test('shop read failure stops checking label and offers a retry from cart', async ({ page, scenario }) => {
  await scenario.cart();
  const path = '**/api/v1/shop';
  await page.route(path, route => route.fulfill({ status: 500, json: { code: 'DB_INTERNAL', message: 'SQL hidden log' } }));
  await page.goto('/cart');
  await expect(page.getByRole('button', { name: 'Chưa kiểm tra được shop', exact: true })).toBeDisabled();
  await expect(page.locator('main .error-box')).toContainText('Dịch vụ đang gặp sự cố');
  await page.unroute(path);
  await page.locator('main .error-box').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: false })).toBeVisible();
});

test('product image deadline shows fallback without blocking product actions', async ({ page, scenario }) => {
  await page.clock.install();
  scenario.products[0].imageUrl = 'http://127.0.0.1:4173/slow-image.png';
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/slow-image.png', async route => { await gate; await route.abort().catch(() => {}); });
  await page.goto('/products/banh-thu', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.detail-media img')).toHaveAttribute('aria-busy', 'true');
  await page.clock.runFor(15200);
  await expect(page.locator('.detail-media .asset-image-fallback')).toContainText('Chưa tải được ảnh');
  await expect(page.getByRole('button', { name: 'Thêm vào giỏ', exact: true })).toBeEnabled();
  release();
});

test('clipboard permission that never resolves cannot leave button loading', async ({ page, scenario }) => {
  await scenario.cart();
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: () => new Promise<void>(() => {}) },
  }));
  await page.goto('/checkout');
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
  const submit = page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL('/order-success');
  await page.clock.install();
  await page.getByRole('button', { name: 'Sao chép thông tin tra cứu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang sao chép…', exact: true })).toBeDisabled();
  await page.clock.runFor(5200);
  await expect(page.locator('.feedback-notice')).toContainText('Chưa sao chép được');
  await expect(page.getByRole('button', { name: 'Sao chép thông tin tra cứu', exact: true })).toBeEnabled();
  expect(scenario.mutations('/orders')).toHaveLength(1);
  expect(scenario.order.id).toBe(ids.order);
});
