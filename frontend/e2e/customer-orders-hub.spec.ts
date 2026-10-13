import { test, expect, ids, submit } from './fixtures';

test('main navigation opens My Orders with account history and embedded lookup', async ({ page, scenario }, testInfo) => {
  await scenario.authenticate('CUSTOMER');
  await page.goto('/');
  const mobile = testInfo.project.name.includes('mobile');
  if (mobile) await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  const navigation = page.getByRole('navigation', {
    name: mobile ? 'Điều hướng trên điện thoại' : 'Điều hướng chính', exact: true,
  });
  await expect(navigation.getByRole('link', { name: 'Tra cứu đơn', exact: true })).toHaveCount(0);
  await navigation.getByRole('link', { name: 'Đơn hàng của tôi', exact: true }).click();
  await expect(page).toHaveURL('/account/orders');
  await expect(page.getByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeVisible();
  await expect(page.locator('.orders-table')).toContainText('ORD-TEST001');
  await expect(page.locator('.orders-table')).toContainText('10.000 đ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.orders-table-card').scrollIntoViewIfNeeded();
  await expect(page.locator('.orders-table-card')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('order-history.png'), fullPage: true });
  await page.getByRole('button', { name: 'Tra cứu đơn', exact: true }).click();
  await expect(page).toHaveURL('/account/orders?view=lookup');
  await expect(page.locator('.lookup-card')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('order-lookup.png'), fullPage: true });
  await page.locator('#orderCode').fill('ord-test001');
  await page.locator('#guestToken').fill('secret-test-token');
  await submit(page);
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tra cứu đơn khác', exact: true }).click();
  await expect(page.locator('#orderCode')).toHaveValue('ord-test001');
  await page.getByRole('button', { name: 'Lịch sử đặt hàng', exact: true }).click();
  await expect(page).toHaveURL('/account/orders');
  await page.locator(`main a[href="/account/orders/${ids.order}"]`).click();
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
});

test('guests can look up orders without requesting account history or logging in', async ({ page, scenario }) => {
  await page.goto('/account/orders');
  await expect(page.getByRole('heading', { name: 'Đăng nhập để xem lịch sử đặt hàng' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tài khoản', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tra cứu đơn', exact: true }).click();
  await page.locator('#orderCode').fill('ORD-TEST001');
  await page.locator('#guestToken').fill('secret-test-token');
  await submit(page);
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
  expect(scenario.calls.filter(request => new URL(request.url()).pathname === '/api/v1/me/orders')).toHaveLength(0);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Đăng nhập để xem lịch sử đặt hàng' })).toBeVisible();
  await page.goForward();
  await expect(page.locator('#orderCode')).toBeVisible();
});

test('history sign-in returns to My Orders and shows authenticated orders', async ({ page, scenario }) => {
  await page.goto('/account/orders');
  await page.getByRole('link', { name: 'Đăng nhập xem lịch sử', exact: false }).click();
  await expect(page).toHaveURL('/login');
  await page.locator('#loginEmail').fill('test@example.com');
  await page.locator('#loginPass').fill('test-password');
  await submit(page);
  await expect(page).toHaveURL('/account/orders');
  await expect(page.locator('.orders-table')).toContainText('ORD-TEST001');
  expect(scenario.calls.find(request => new URL(request.url()).pathname === '/api/v1/me/orders')?.headers().authorization).toBe('Bearer e2e-access-token');
});

test('legacy lookup links redirect to the lookup section and survive reload', async ({ page }) => {
  await page.goto('/guest-order');
  await expect(page).toHaveURL('/account/orders?view=lookup');
  await expect(page.getByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tra cứu đơn', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#guestToken')).toBeVisible();
});

test('empty account history keeps lookup available and offers the catalog', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await page.route('**/api/v1/me/orders?**', route => route.fulfill({
    json: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
  }));
  await page.goto('/account/orders');
  await expect(page.getByText('Bạn chưa có đơn hàng nào', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tra cứu đơn', exact: true }).click();
  await expect(page.locator('#orderCode')).toBeVisible();
  await page.getByRole('button', { name: 'Lịch sử đặt hàng', exact: true }).click();
  await page.getByRole('button', { name: 'Chọn sản phẩm', exact: true }).click();
  await expect(page).toHaveURL('/#catalog');
});

test('failed account history does not block order lookup', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await page.route('**/api/v1/me/orders?**', route => route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR' } }));
  await page.goto('/account/orders');
  await expect(page.locator('main .error-box')).toBeVisible();
  await page.getByRole('button', { name: 'Tra cứu đơn', exact: true }).click();
  await expect(page.locator('#guestToken')).toBeVisible();
});
