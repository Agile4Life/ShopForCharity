import { test, expect, ids, submit, expectMutation } from './fixtures';

test('protected account redirects to login and returns after authentication', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page).toHaveURL('/login');
  await page.locator('#loginEmail').fill('test@example.com');
  await page.locator('#loginPass').fill('test-password');
  await submit(page);
  await expect(page).toHaveURL('/account/profile');
  await expect(page.locator('#profName')).toHaveValue('Nguyễn Văn Test');
});

test('invalid login shows error', async ({ page, scenario }) => {
  scenario.loginError = true;
  await page.goto('/login');
  await page.locator('#loginEmail').fill('test@example.com');
  await page.locator('#loginPass').fill('wrong-password');
  await submit(page);
  await expect(page.getByText('Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/login');
});

test('registration submits metadata and asks user to verify email', async ({ page, scenario }) => {
  await page.goto('/register');
  await page.locator('#regName').fill('Nguyễn Văn Test');
  await page.locator('#regPhone').fill('0912345678');
  await page.locator('#regEmail').fill('test@example.com');
  await page.locator('#regPass').fill('test-password');
  await submit(page);
  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo tài khoản' })).toBeVisible();
  expect(scenario.mutations('/signup')[0].postDataJSON()).toMatchObject({ data: { full_name: 'Nguyễn Văn Test', phone: '0912345678' } });
});

test('forgot password submits recovery email', async ({ page, scenario }) => {
  await page.goto('/forgot-password');
  await page.locator('#forgotEmail').fill('test@example.com');
  await submit(page);
  await expect.poll(() => scenario.mutations('/recover').length).toBe(1);
  expect(scenario.mutations('/recover')[0].postDataJSON()).toMatchObject({ email: 'test@example.com' });
});

test('reset password rejects mismatch then updates authenticated password', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await page.goto('/reset-password');
  await page.locator('#newPass').fill('new-password');
  await page.locator('#confirmPass').fill('different-password');
  await submit(page);
  await expect(page.getByText('Mật khẩu xác nhận không khớp', { exact: true })).toBeVisible();
  await page.locator('#confirmPass').fill('new-password');
  await submit(page);
  await expect.poll(() => scenario.mutations('/user').length).toBe(1);
  expect(scenario.mutations('/user')[0].postDataJSON()).toMatchObject({ password: 'new-password' });
});

test('customer cannot open seller area', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Truy cập bị từ chối', exact: true })).toBeVisible();
  expect(scenario.calls.filter(r => new URL(r.url()).pathname.includes('/seller/'))).toHaveLength(0);
});

test('profile update sends version and excludes identity/role', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await page.goto('/account/profile');
  await page.locator('#profName').fill('Tên mới');
  await submit(page);
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu thông tin.' })).toBeVisible();
  await expectMutation(scenario, '/me', { fullName: 'Tên mới', phone: '0912345678', expectedVersion: 3 });
  expect(scenario.mutations('/me')[0].postDataJSON()).not.toHaveProperty('role');
  expect(scenario.mutations('/me')[0].postDataJSON()).not.toHaveProperty('email');
});

test('authenticated checkout prefills profile and does not create guest session', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await scenario.cart();
  await page.goto('/checkout');
  await expect(page.locator('#fullName')).toHaveValue('Nguyễn Văn Test');
  await expect(page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
  await submit(page);
  await expect(page).toHaveURL('/order-success');
  expect(scenario.mutations('/checkout/session')).toHaveLength(0);
  expect(scenario.mutations('/orders')[0].headers().authorization).toBe('Bearer e2e-access-token');
});

for (const actor of ['guest', 'customer'] as const) {
  test(`${actor} looks up order and cancels with current version`, async ({ page, scenario }) => {
    if (actor === 'customer') {
      await scenario.authenticate('CUSTOMER');
      await page.goto('/account/orders');
      await page.locator(`main a[href="/account/orders/${ids.order}"]`).click();
    } else {
      await page.goto('/guest-order');
      await page.locator('#orderCode').fill('ORD-TEST001');
      await page.locator('#guestToken').fill('secret-test-token');
      await submit(page);
    }
    await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy đơn hàng', exact: true }).click();
    await page.getByLabel('Lý do hủy đơn hàng').fill('Đặt nhầm');
    await page.getByRole('button', { name: 'Xác nhận hủy đơn', exact: true }).click();
    await expectMutation(scenario, '/cancel', { expectedVersion: 7, reason: 'Đặt nhầm' });
    await expect(page.locator('.header-status-badges')).toContainText('Đã hủy');
  });
  test(`${actor} reports bank transfer without declaring order paid`, async ({ page, scenario }) => {
    scenario.order.status = 'ACCEPTED';
    scenario.order.paymentMethod = 'BANK_TRANSFER';
    if (actor === 'customer') {
      await scenario.authenticate('CUSTOMER');
      await page.goto(`/account/orders/${ids.order}`);
    } else {
      await page.goto('/guest-order');
      await page.locator('#orderCode').fill('ORD-TEST001');
      await page.locator('#guestToken').fill('secret-test-token');
      await submit(page);
    }
    await page.getByRole('button', { name: /đã chuyển khoản/i }).click();
    await expectMutation(scenario, '/payment-report', { expectedVersion: 7 });
    await expect(page.locator('.header-status-badges')).toContainText('Đã báo chuyển khoản');
    expect(scenario.order.paymentStatus).toBe('REPORTED');
  });
}

test('wrong guest token shows error and does not fetch private order', async ({ page, scenario }) => {
  scenario.accessError = true;
  await page.goto('/guest-order');
  await page.locator('#orderCode').fill('ORD-TEST001');
  await page.locator('#guestToken').fill('wrong-token');
  await submit(page);
  await expect(page.locator('main .error-box').filter({ hasText: 'Mã đơn hoặc khóa truy cập' })).toBeVisible();
  expect(scenario.calls.filter(r => r.method() === 'GET' && new URL(r.url()).pathname.includes('/guest/orders/'))).toHaveLength(0);
});
