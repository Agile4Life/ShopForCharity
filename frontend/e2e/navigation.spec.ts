import { test, expect, ids, expectMutation } from './fixtures';

for (const authenticated of [false, true]) {
  test(`auth callback resolves ${authenticated ? 'existing' : 'missing'} session`, async ({ page, scenario }) => {
    if (authenticated) await scenario.authenticate('CUSTOMER');
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(authenticated ? '/' : '/login');
  });
}

test('logout removes account session and blocks protected pages', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await page.goto('/account/profile');
  await expect(page.locator('#profName')).toHaveValue('Nguyễn Văn Test');
  const menu = page.getByRole('button', { name: 'Mở menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  // One-time seed: subsequent navigation must preserve logout's actual storage state.
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => localStorage.getItem('sb-127-auth-token'))).toBeNull();
  await page.goto('/account/orders');
  await expect(page).toHaveURL('/login');
});

test('cart quantity changes update subtotal and never exceed per-line limit', async ({ page, scenario }) => {
  await scenario.cart();
  await page.goto('/cart');
  const increase = page.getByRole('button', { name: 'Tăng số lượng bánh thử', exact: true });
  await increase.click();
  await expect(page.locator('.cart-item-card output')).toHaveText('2');
  await expect(page.locator('.summary-total')).toHaveText('20.000 đ');
  for (let i = 2; i < 20; i++) await increase.click();
  await expect(increase).toBeDisabled();
  await page.getByRole('button', { name: 'Giảm số lượng bánh thử', exact: true }).click();
  await expect(page.locator('.cart-item-card output')).toHaveText('19');
});

test('seller archives and reactivates combo with current version', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.goto('/seller/combos');
  await page.getByRole('button', { name: 'Ẩn', exact: true }).click();
  await expectMutation(scenario, '/archive', { expectedVersion: 3 });
  await page.getByRole('button', { name: 'Mở bán', exact: true }).click();
  await expectMutation(scenario, '/activate', { expectedVersion: 4 });
  await expect(page.getByRole('row').filter({ hasText: 'Combo thử' })).toContainText('Đang mở bán');
  expect(scenario.combos[0].id).toBe(ids.combo);
});
