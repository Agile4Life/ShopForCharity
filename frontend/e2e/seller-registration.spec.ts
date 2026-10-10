import { test, expect, type Scenario } from './fixtures';
import type { Page } from '@playwright/test';

async function fill(page: Page) {
  await page.locator('#sellerCode').fill('test-invitation');
  await page.locator('#sellerName').fill('Người bán thử');
  await page.locator('#sellerEmail').fill('new-seller@example.com');
  await page.locator('#sellerPassword').fill('test-password');
  await page.locator('#sellerConfirmation').fill('test-password');
}

async function successEndpoint(page: Page, scenario: Scenario) {
  await page.route('**/api/v1/auth/register-seller', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ code: 'test-invitation', email: 'new-seller@example.com', password: 'test-password' });
    scenario.me.role = 'SELLER';
    await route.fulfill({ status: 201, json: { success: true } });
  });
}

test('separate seller registration, login and shared inventory management', async ({ page, scenario }) => {
  await successEndpoint(page, scenario);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Đăng ký người bán', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đăng ký người bán', exact: true })).toBeVisible();
  await fill(page);
  await page.getByRole('button', { name: 'Tạo tài khoản người bán', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã tạo tài khoản người bán!');
  await page.getByRole('link', { name: 'Đăng nhập để quản lý shop' }).click();
  await page.locator('#loginEmail').fill('new-seller@example.com');
  await page.locator('#loginPass').fill('test-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/seller');
  await expect(page.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
  await page.goto('/seller/products');
  await expect(page.getByText('Bánh thử', { exact: true }).first()).toBeVisible();
  await page.goto('/seller/settings');
  await expect(page.getByRole('heading', { name: /Cấu hình Shop/ }).first()).toBeVisible();
});

test('mismatched password stays local; loading locks fields and prevents duplicate requests', async ({ page, scenario }) => {
  let calls = 0;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/register-seller', async route => {
    calls++;
    await ready;
    scenario.me.role = 'SELLER';
    await route.fulfill({ status: 201, json: { success: true } });
  });
  await page.goto('/register-seller');
  await fill(page);
  await page.locator('#sellerConfirmation').fill('wrong-password');
  await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
  await expect(page.getByRole('alert')).toContainText('Mật khẩu xác nhận chưa khớp');
  expect(calls).toBe(0);
  await page.locator('#sellerConfirmation').fill('test-password');
  await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
  await expect(page.getByRole('button', { name: 'Đang tạo tài khoản...' })).toBeDisabled();
  await expect(page.locator('#sellerEmail')).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Đang tạo tài khoản và cấp quyền');
  await page.locator('main form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(page.getByRole('status')).toContainText('Đã tạo tài khoản người bán!');
  expect(calls).toBe(1);
});

for (const [status, code, message] of [
  [403, 'INVALID_SELLER_CODE', 'Mã đăng ký người bán chưa đúng'],
  [409, 'SELLER_EMAIL_EXISTS', 'Email này đã được sử dụng'],
  [429, 'RATE_LIMITED', 'Chờ một lát'],
  [503, 'SELLER_REGISTRATION_UNKNOWN', 'Thử đăng nhập'],
  [503, 'SELLER_PROFILE_PENDING', 'Tài khoản đã tạo'],
  [503, 'SELLER_REGISTRATION_UNAVAILABLE', 'đang chưa khả dụng'],
] as const) {
  test(`${code}: inline friendly error and usable retry`, async ({ page, scenario }) => {
    await page.route('**/api/v1/auth/register-seller', route => route.fulfill({ status, json: { code, message: 'SQL SELECT private token stack trace', requestId: 'private-support-id' } }));
    await page.goto('/register-seller');
    await fill(page);
    await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('alert')).not.toContainText('SQL');
    await expect(page.getByRole('alert')).not.toContainText(code);
    await expect(page.getByRole('alert')).not.toContainText('private-support-id');
    await expect(page.getByRole('button', { name: 'Tạo tài khoản người bán' })).toBeEnabled();
    await expect(page.locator('#sellerEmail')).toHaveValue('new-seller@example.com');
    await successEndpoint(page, scenario);
    await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
    await expect(page.getByRole('status')).toContainText('Đã tạo tài khoản người bán!');
  });
}

test('network failure allows recovery without exposing logs', async ({ page }) => {
  await page.route('**/api/v1/auth/register-seller', route => route.abort('failed'));
  await page.goto('/register-seller');
  await fill(page);
  await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
  await expect(page.getByRole('alert')).toContainText('Kiểm tra mạng');
  await expect(page.getByRole('button', { name: 'Tạo tài khoản người bán' })).toBeEnabled();
});

test('unconfirmed write result suggests login before creating another account', async ({ page }) => {
  await page.route('**/api/v1/auth/register-seller', route => route.fulfill({ status: 201, json: { success: false } }));
  await page.goto('/register-seller');
  await fill(page);
  await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
  await expect(page.getByRole('alert')).toContainText('Thử đăng nhập bằng email và mật khẩu vừa nhập');
  await expect(page.getByRole('alert')).not.toContainText('WRITE_RESULT_UNKNOWN');
  await expect(page.getByRole('button', { name: 'Tạo tài khoản người bán' })).toBeEnabled();
});

test('seller form and success feedback fit small mobile, tablet and desktop', async ({ page, scenario }) => {
  await successEndpoint(page, scenario);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/register-seller');
    await expect(page.getByRole('heading', { name: 'Đăng ký người bán', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await fill(page);
    await page.getByRole('button', { name: 'Tạo tài khoản người bán' }).click();
    await expect(page.getByRole('status')).toContainText('Đã tạo tài khoản người bán!');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
