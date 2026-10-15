import { test, expect, ids, submit } from './fixtures';

for (const width of [1280, 390, 320]) {
  for (const [path, kind, catalogId] of [
    ['/products/banh-thu', 'PRODUCT', ids.product], ['/combos/combo-thu', 'COMBO', ids.combo],
  ]) {
    test(`buy ${kind} now with selected quantity at ${width}px`, async ({ page, scenario }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.getByRole('button', { name: 'Tăng số lượng', exact: true }).click();
      const button = page.getByRole('button', { name: 'Mua ngay', exact: true });
      await expect(button).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await button.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`buy-now-${kind}-${width}.png`) });
      await button.click();
      await expect(page).toHaveURL('/checkout');
      await expect.poll(() => scenario.mutations('/checkout/quote').length).toBeGreaterThan(0);
      expect(scenario.mutations('/checkout/quote')[0].postDataJSON()).toMatchObject({ items: [{ kind, catalogId, quantity: 2 }] });
      expect(scenario.mutations('/orders')).toHaveLength(0);
      const back = page.getByRole('link', { name: kind === 'PRODUCT' ? 'Quay lại sản phẩm' : 'Quay lại combo', exact: true }).first();
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).toHaveURL(`/${kind === 'PRODUCT' ? 'products' : 'combos'}/${catalogId}`);
      await expect(page.getByRole('button', { name: 'Mua ngay', exact: true })).toBeVisible();
    });
  }
}

test('buy now excludes other cart items and preserves the cart after purchase', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/combos/combo-thu');
  await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
  await expect(page).toHaveURL('/checkout');
  await expect.poll(() => scenario.mutations('/checkout/quote').length).toBeGreaterThan(0);
  expect(scenario.mutations('/checkout/quote')[0].postDataJSON().items).toEqual([{ kind: 'COMBO', catalogId: ids.combo, quantity: 1 }]);
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#pickupPointId').selectOption(ids.pickup);
  await submit(page);
  await expect(page).toHaveURL('/order-success');
  expect(scenario.mutations('/orders')[0].postDataJSON().items).toEqual([{ kind: 'COMBO', catalogId: ids.combo, quantity: 1 }]);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!));
  expect(cart).toHaveLength(1);
  expect(cart[0]).toMatchObject({ kind: 'PRODUCT', catalogId: ids.product, quantity: 1 });
});

test('buy now does not add quantities of the same item already in cart, including after reload', async ({ page, scenario }) => {
  await scenario.cart();
  await page.addInitScript(() => {
    const cart = JSON.parse(localStorage.getItem('school_shop_cart_v1')!);
    cart[0].quantity = 4;
    localStorage.setItem('school_shop_cart_v1', JSON.stringify(cart));
  });
  await page.goto('/products/banh-thu');
  await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
  await expect(page).toHaveURL('/checkout');
  await expect.poll(() => scenario.mutations('/checkout/quote').length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
  for (const request of scenario.mutations('/checkout/quote')) {
    expect(request.postDataJSON().items).toEqual([{ kind: 'PRODUCT', catalogId: ids.product, quantity: 1 }]);
  }
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!));
  expect(cart[0].quantity).toBe(4);
  await page.locator('#fullName').fill('Nguyễn Văn Test');
  await page.locator('#phone').fill('0912345678');
  await page.locator('#pickupPointId').selectOption(ids.pickup);
  await submit(page);
  await expect(page).toHaveURL('/order-success');
  expect(scenario.mutations('/orders')[0].postDataJSON().items).toEqual([{ kind: 'PRODUCT', catalogId: ids.product, quantity: 1 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!)[0].quantity)).toBe(4);
});

test('buy now selection survives logging in before checkout', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/combos/combo-thu');
  await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
  await expect(page).toHaveURL('/checkout');
  await page.locator('main a[href="/login"]').click();
  scenario.me.role = 'CUSTOMER';
  scenario.role = 'CUSTOMER';
  await page.locator('#loginEmail').fill('test@example.com');
  await page.locator('#loginPass').fill('password-test');
  await submit(page);
  await expect(page).toHaveURL('/checkout');
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
  const quotes = scenario.mutations('/checkout/quote');
  expect(quotes.at(-1)!.postDataJSON().items).toEqual([{ kind: 'COMBO', catalogId: ids.combo, quantity: 1 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!)[0])).toMatchObject({ catalogId: ids.product, quantity: 1 });
});

test('buy now stays on detail when stock becomes unavailable', async ({ page, scenario }) => {
  await page.goto('/products/banh-thu');
  const buy = page.getByRole('button', { name: 'Mua ngay', exact: true });
  await expect(buy).toBeVisible();
  scenario.products[0].availableStock = 0;
  scenario.products[0].isSoldOut = true;
  await buy.click();
  await expect(page.locator('.feedback-notice')).toContainText('hết hàng');
  await expect(page).toHaveURL('/products/banh-thu');
  await expect(buy).toBeEnabled();
  expect(scenario.mutations('/checkout/quote')).toHaveLength(0);
});
