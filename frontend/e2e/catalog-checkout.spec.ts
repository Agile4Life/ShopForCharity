import { test, expect, ids, product, submit, expectMutation } from './fixtures';

test('catalog search, category and sort send filters to API', async ({ page, scenario }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true })).toBeVisible();
  await page.getByLabel('Tìm món trong gian hàng').fill('Bánh');
  await page.getByRole('button', { name: 'Đồ ăn vặt', exact: true }).click();
  await page.getByLabel('Sắp xếp sản phẩm').selectOption('price,asc');
  await expect.poll(() => scenario.calls.some(r => {
    const u = new URL(r.url());
    return u.pathname === '/api/v1/products' && u.searchParams.get('q') === 'Bánh'
      && u.searchParams.get('category') === 'SNACK' && u.searchParams.get('sort') === 'price,asc';
  })).toBe(true);
  await expect(page.getByRole('button', { name: 'Thêm Móc khóa thử vào giỏ' })).toHaveCount(0);
});

test('product detail adds cart item, persists after refresh, removes and undoes', async ({ page }) => {
  await page.goto('/products/banh-thu');
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Thêm.*vào giỏ/ }).click();
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm');
  await page.goto('/cart');
  await expect(page.locator('.cart-item-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.cart-item-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa Bánh thử', exact: true }).click();
  await expect(page.locator('.cart-item-card')).toHaveCount(0);
  await page.getByRole('button', { name: /Hoàn tác/ }).click();
  await expect(page.locator('.cart-item-card')).toHaveCount(1);
});

test('combo detail adds distinct combo cart line', async ({ page }) => {
  await page.goto('/combos/combo-thu');
  await page.getByRole('button', { name: 'Thêm combo vào giỏ' }).click();
  await expect(page.locator('.feedback-notice')).toContainText('Đã thêm');
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Combo thử' })).toBeVisible();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!));
  expect(cart[0]).toMatchObject({ kind: 'COMBO', catalogId: ids.combo, quantity: 1 });
});

test('sold out product cannot be added', async ({ page, scenario }) => {
  scenario.products[0].availableStock = 0;
  scenario.products[0].isSoldOut = true;
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Thêm Bánh thử vào giỏ', exact: true })).toBeDisabled();
});

for (const method of ['CASH', 'BANK_TRANSFER']) {
  test(`guest checkout ${method} creates order, clears cart and keeps token out of storage/URL`, async ({ page, scenario }) => {
    await scenario.cart();
    await page.goto('/checkout');
    await page.locator('#fullName').fill('Nguyễn Văn Test');
    await page.locator('#phone').fill('0912345678');
    await page.locator('#email').fill('test@example.com');
    await page.locator(`input[value="${method}"]`).check();
    await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
    await submit(page);
    await expect(page).toHaveURL('/order-success');
    await expect(page.getByRole('heading', { name: 'Đã nhận đơn hàng' })).toBeVisible();
    await expectMutation(scenario, '/orders', { paymentMethod: method, quoteToken: 'quote-test',
      items: [{ kind: 'PRODUCT', catalogId: ids.product, quantity: 1 }],
      buyer: { fullName: 'Nguyễn Văn Test', phone: '0912345678', email: 'test@example.com' }, pickupPointId: ids.pickup });
    expect(scenario.mutations('/checkout/session').length).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem('school_shop_cart_v1'))).toBe('[]');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('secret-test-token');
    expect(page.url()).not.toContain('secret-test-token');
  });
}

for (const condition of ['sessionError', 'quoteUnavailable', 'quoteExpired'] as const) {
  test(`checkout blocks submission when ${condition}`, async ({ page, scenario }) => {
    scenario[condition] = true;
    await scenario.cart();
    await page.goto('/checkout');
    await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeDisabled();
    if (condition === 'sessionError') {
      await expect(page.getByText('SESSION_UNAVAILABLE', { exact: true })).toBeVisible();
      expect(scenario.mutations('/checkout/quote')).toHaveLength(0);
    } else await expect.poll(() => scenario.mutations('/checkout/quote').length).toBeGreaterThan(0);
    expect(scenario.mutations('/orders')).toHaveLength(0);
  });
}

test('closed shop blocks cart checkout', async ({ page, scenario }) => {
  scenario.shop.acceptingOrders = false;
  await scenario.cart();
  await page.goto('/cart');
  await expect(page.getByRole('button', { name: 'Tạm dừng nhận đơn' })).toBeDisabled();
});

test('checkout validates buyer and preserves cart on stock conflict', async ({ page, scenario }) => {
  scenario.orderError = true;
  await scenario.cart();
  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
  await submit(page);
  await expect(page.locator('#fullName')).toHaveAttribute('aria-invalid', 'true');
  expect(scenario.mutations('/orders')).toHaveLength(0);
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#email').fill('test@example.com');
  await submit(page);
  await expect(page.getByText('Giá hoặc số lượng vừa thay đổi. Kiểm tra lại đơn trước khi đặt hàng.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!).length)).toBe(1);
});

test('empty checkout returns to cart and unknown route renders 404', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL('/cart');
  await page.goto('/missing-page');
  await expect(page.locator('main')).toContainText('404');
});
