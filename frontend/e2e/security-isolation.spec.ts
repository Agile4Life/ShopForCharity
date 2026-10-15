import { test, expect, ids, submit } from './fixtures';
import type { Route } from '@playwright/test';

test('switching accounts cannot display the previous account order from browser cache', async ({ page, scenario }, testInfo) => {
  await scenario.authenticate('CUSTOMER');
  scenario.order.buyerName = 'Thông tin riêng của khách A';
  await page.goto(`/account/orders/${ids.order}`);
  await expect(page.locator('main')).toContainText('Thông tin riêng của khách A');
  await page.getByRole('button', { name: 'Menu tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await expect(page).toHaveURL('/');
  const otherId = '00000000-0000-4000-8000-000000000071';
  await page.route('**/auth/v1/token?**', route => route.fulfill({ json: {
    access_token: 'other-account-access-token', refresh_token: 'other-account-refresh-token',
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: otherId, aud: 'authenticated', role: 'authenticated', email: 'other@example.com',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  } }));
  scenario.me = { ...scenario.me, id: otherId, authUserId: otherId, fullName: 'Khách B', email: 'other@example.com' };
  await page.route(`**/api/v1/me/orders/${ids.order}`, route => route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } }));
  if (testInfo.project.name.includes('mobile')) {
    await page.getByRole('navigation', { name: 'Điều hướng nhanh', exact: true }).getByRole('link', { name: 'Đăng nhập', exact: true }).click();
  } else await page.locator('header').getByRole('link', { name: /Đăng nhập/ }).click();
  await page.locator('#loginEmail').fill('other@example.com');
  await page.locator('#loginPass').fill('test-password');
  await submit(page);
  await expect(page).toHaveURL('/');
  // Navigate without reloading so the React Query cache survives.
  await page.evaluate(id => {
    history.pushState(null, '', `/account/orders/${id}`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, ids.order);
  await expect(page.locator('main .error-box')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Thông tin riêng của khách A');
});

test('expired guest authorization hides cached personal data after API denies access', async ({ page, scenario }) => {
  scenario.order.buyerName = 'Thông tin riêng của khách vãng lai';
  await page.goto('/account/orders?view=lookup');
  await page.locator('#orderCode').fill('ORD-TEST001');
  await page.locator('#guestToken').fill('secret-test-token');
  await submit(page);
  await expect(page.locator('main')).toContainText('Thông tin riêng của khách vãng lai');
  await page.route('**/api/v1/guest/orders/ORD-TEST001', route => route.fulfill({ status: 401, json: { code: 'SESSION_EXPIRED' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('main .error-box')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('main')).not.toContainText('Thông tin riêng của khách vãng lai');
});

test('an order response arriving after logout cannot reopen the previous account checkout result', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await scenario.cart();
  let pending: Route | undefined;
  await page.route('**/api/v1/orders', route => { pending = route; });
  await page.goto('/checkout');
  await page.locator('#pickupPointId').selectOption(ids.pickup);
  await submit(page);
  await expect.poll(() => !!pending).toBe(true);
  await page.getByRole('button', { name: 'Menu tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Menu tài khoản', exact: true })).toHaveCount(0);
  const response = page.waitForResponse('**/api/v1/orders');
  await pending!.fulfill({ json: { ...scenario.order, orderId: ids.order } });
  await response;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Đặt hàng thành công', exact: true })).toHaveCount(0);
});
