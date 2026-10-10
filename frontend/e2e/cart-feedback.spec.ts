import { test, expect, ids, product, combo } from './fixtures';

for (const location of ['product-card', 'combo-card', 'product-detail', 'combo-detail'] as const) {
  test(`${location}: loading prevents duplicates and success opens persisted cart`, async ({ page }) => {
    const isCombo = location.startsWith('combo');
    const item = isCombo ? combo : product;
    const prefix = isCombo ? 'combos' : 'products';
    await page.goto(location.endsWith('detail') ? `/${prefix}/${item.slug}` : '/');
    const button = location === 'product-card'
      ? page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true })
      : page.locator(location === 'combo-card' ? '.combo-card .add-to-cart-button' : '.add-cart-section .add-to-cart-button');
    await expect(button).toBeEnabled();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let requests = 0;
    await page.route(`**/api/v1/${prefix}/${item.id}`, async route => {
      requests++;
      await pending;
      await route.fulfill({ json: { ...item, price: 17000 } });
    });
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toBeDisabled();
    await button.dispatchEvent('click');
    expect(requests).toBe(1);
    release();
    await expect(page.locator('.feedback-notice')).toContainText(`Đã thêm 1 × ${item.name}`);
    await expect(button).toHaveAttribute('data-cart-state', 'added');
    await expect(button).toBeEnabled();
    const notice = page.locator('.feedback-notice');
    const box = await notice.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await notice.getByRole('link', { name: 'Xem giỏ' }).click();
    await expect(page).toHaveURL('/cart');
    await expect(page.locator('.cart-item-card')).toHaveCount(1);
    await page.reload();
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!));
    expect(cart).toEqual([expect.objectContaining({ catalogId: item.id, quantity: 1, price: 17000 })]);
  });
}

test('failed availability check shows error, preserves cart and allows retry', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true });
  await expect(button).toBeEnabled();
  const path = `**/api/v1/products/${ids.product}`;
  await page.route(path, route => route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Chưa thể kiểm tra tồn kho. Vui lòng thử lại.' } }));
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Chưa thể kiểm tra tồn kho');
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('school_shop_cart_v1'))).toBe('[]');
  await page.unroute(path);
  await button.click();
  await expect(page.locator('.feedback-notice')).toContainText(`Đã thêm 1 × ${product.name}`);
});

test('latest sold-out state and existing cart quantity cannot exceed stock', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/');
  const button = page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true });
  await expect(button).toBeEnabled();
  scenario.products[0].availableStock = 0;
  await button.click();
  await expect(page.getByRole('alert')).toContainText('vừa hết hàng');
  scenario.products[0].availableStock = 1;
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Hiện đã có 1 trong giỏ');
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!));
  expect(cart[0].quantity).toBe(1);
});

test('parallel additions preserve both lines and reduced motion disables animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/products/*', async route => {
    await pending;
    await route.fulfill({ json: { ...product, id: route.request().url().split('/').at(-1) } });
  });
  const first = page.getByRole('button', { name: `Thêm ${product.name} vào giỏ`, exact: true });
  const second = page.getByRole('button', { name: 'Thêm Móc khóa thử vào giỏ', exact: true });
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('aria-busy', 'true');
  expect(await first.locator('svg').evaluate(icon => getComputedStyle(icon).animationName)).toBe('none');
  release();
  await expect(first).toHaveAttribute('data-cart-state', 'added');
  await expect(second).toHaveAttribute('data-cart-state', 'added');
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1')!));
  expect(cart.map((item: { catalogId: string }) => item.catalogId).sort()).toEqual([ids.product, ids.other].sort());
});
