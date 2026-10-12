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

test('registration signs in and replaces the registration page with the homepage', async ({ page, scenario }) => {
  await page.goto('/login');
  await page.goto('/register');
  await page.locator('#regName').fill('Nguyễn Văn Test');
  await page.locator('#regPhone').fill('0912345678');
  await page.locator('#regEmail').fill('test@example.com');
  await page.locator('#regPass').fill('test-password');
  await submit(page);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Menu tài khoản' })).toBeVisible();
  expect(scenario.mutations('/auth/register')[0].postDataJSON()).toMatchObject({ fullName: 'Nguyễn Văn Test', phone: '0912345678' });
  expect(scenario.mutations('/signup')).toHaveLength(0);
  expect(scenario.mutations('/token')).toHaveLength(1);
  await page.goBack();
  await expect(page).toHaveURL('/login');
  await page.goto('/account/profile');
  await expect(page.locator('#profName')).toHaveValue('Nguyễn Văn Test');
});

test('registration rejects duplicate email without trying to sign in', async ({ page, scenario }) => {
  await page.route('**/api/v1/auth/register', route => route.fulfill({ status: 409, json: { code: 'CUSTOMER_EMAIL_EXISTS' } }));
  await page.goto('/register');
  await page.locator('#regName').fill('Nguyễn Văn Test');await page.locator('#regPhone').fill('0912345678');
  await page.locator('#regEmail').fill('test@example.com');await page.locator('#regPass').fill('test-password');await submit(page);
  await expect(page.getByText('Email này đã được sử dụng. Đăng nhập hoặc dùng email khác để đăng ký.', { exact: true })).toBeVisible();
  expect(scenario.mutations('/token')).toHaveLength(0);
  await expect(page.locator('#regEmail')).toHaveValue('test@example.com');
  await expect(page.locator('main form button[type="submit"]')).toBeEnabled();
  await expect(page).toHaveURL('/register');
});

test('created account with failed automatic login keeps the login guidance visible', async ({ page, scenario }) => {
  scenario.loginError = true;
  await page.goto('/register');
  await page.locator('#regName').fill('Nguyễn Văn Test');await page.locator('#regPhone').fill('0912345678');
  await page.locator('#regEmail').fill('test@example.com');await page.locator('#regPass').fill('test-password');await submit(page);
  await expect(page).toHaveURL('/register');
  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo tài khoản' })).toContainText('Bạn có thể đăng nhập');
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

test('profile form waits for the saved profile after a fresh page load', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/me', async route => {
    await ready;
    await route.fulfill({ json: scenario.me });
  });
  await page.goto('/account/profile');
  await expect(page.locator('#profName')).toHaveCount(0);
  release();
  await expect(page.locator('#profName')).toHaveValue('Nguyễn Văn Test');
  await expect(page.locator('#profPhone')).toHaveValue('0912345678');
});

test('authenticated checkout prefills profile and does not create guest session', async ({ page, scenario }) => {
  await scenario.authenticate('CUSTOMER');
  await scenario.cart();
  await page.goto('/checkout');
  await expect(page.locator('#fullName')).toHaveValue('Nguyễn Văn Test');
  await page.locator('#customPickupLocation').fill('Sảnh thư viện');
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
