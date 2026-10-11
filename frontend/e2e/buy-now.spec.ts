import { test, expect, ids } from './fixtures';

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
    });
  }
}

test('buy now preserves other cart items', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/combos/combo-thu');
  await page.getByRole('button', { name: 'Mua ngay', exact: true }).click();
  await expect(page).toHaveURL('/checkout');
  await expect.poll(() => scenario.mutations('/checkout/quote').length).toBeGreaterThan(0);
  expect(scenario.mutations('/checkout/quote')[0].postDataJSON().items).toEqual([
    { kind: 'PRODUCT', catalogId: ids.product, quantity: 1 }, { kind: 'COMBO', catalogId: ids.combo, quantity: 1 },
  ]);
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
