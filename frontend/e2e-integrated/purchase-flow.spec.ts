import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = require('../../backend/node_modules/sharp');
const baseURL = 'http://127.0.0.1:5173';
const backendURL = 'http://127.0.0.1:8080';
const key = process.env.E2E_HARNESS_KEY!;

type State = {
  products: { id: string; name: string; price: string; status: string; stock_on_hand: number; stock_reserved: number }[];
  orders: { id: string; order_code: string; status: string; payment_status: string; payment_method: string; total: string; received_amount: string }[];
  paymentEvents: { order_id: string; type: string; amount: string }[];
  audit: { action: string; entity_id: string }[];
};

test('seller product → live catalog update → bank transfer → cash → completion', async ({ browser, request }, testInfo) => {
  const sellerContext = await browser.newContext({ baseURL });
  const buyerContext = await browser.newContext({ baseURL });
  const seller = await sellerContext.newPage();
  const buyer = await buyerContext.newPage();
  const name = `Playwright sản phẩm ${Date.now()}`;
  let productId = '';
  let pickupId = '';
  let bankOrderId = '';
  const results: { name: string; status: string; elapsedMs: number; screenshot?: string }[] = [];
  const apiErrors: { method: string; path: string; status: number; code?: string }[] = [];
  for (const page of [seller, buyer]) {
    page.on('response', async response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/v1') && response.status() >= 400) {
        const data = await response.json().catch(() => null);
        apiErrors.push({ method: response.request().method(), path: url.pathname, status: response.status(), code: data?.code });
      }
    });
  }
  const state = async (): Promise<State> => {
    const response = await request.get(`${backendURL}/__e2e/state`, { headers: { 'x-e2e-key': key } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  async function step(title: string, page: Page, action: () => Promise<void>) {
    await test.step(title, async () => {
      const start = Date.now();
      console.log(`START ${title}`);
      try {
        await page.bringToFront();
        await action();
        const screenshot = `${String(results.length + 1).padStart(2, '0')}.png`;
        await page.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true, mask: [page.locator('.guest-credentials-box')] });
        results.push({ name: title, status: 'PASS', elapsedMs: Date.now() - start, screenshot });
        console.log(`PASS ${title}`);
      } catch (error) {
        console.log('FLOW_FAILURE_CONTEXT', await page.evaluate(() => {
          const input = document.querySelector<HTMLInputElement>('#phone');
          const box = input?.getBoundingClientRect();
          return { path: location.pathname, visibility: document.visibilityState,
            phone: input ? { disabled: input.disabled, readOnly: input.readOnly,
              width: box?.width, height: box?.height, display: getComputedStyle(input).display,
              visibility: getComputedStyle(input).visibility } : null };
        }).catch(() => null));
        await page.screenshot({ path: testInfo.outputPath('flow-failure.png'), fullPage: true,
          mask: [page.locator('.cred-code'), page.locator('input[type="password"]')] }).catch(() => {});
        results.push({ name: title, status: 'FAIL', elapsedMs: Date.now() - start });
        throw error;
      }
    });
  }
  async function mutation(page: Page, path: string, action: () => Promise<unknown>) {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1${path}` && response.request().method() !== 'GET', { timeout: 30000 });
    await action();
    const response = await pending;
    const body = await response.json();
    expect(response.ok(), `${path}: ${response.status()} ${body?.code ?? ''}`).toBeTruthy();
    return body;
  }
  async function openGuestOrder(page: Page) {
    await page.getByRole('link', { name: 'Xem đơn hàng', exact: true }).click();
    await page.getByRole('button', { name: 'Tra cứu đơn hàng', exact: true }).click();
    await expect(page.locator('.header-status-badges')).toContainText('Chờ liên hệ');
  }
  async function acceptOrder(orderId: string) {
    await seller.goto(`/seller/orders/${orderId}`);
    await seller.getByRole('button', { name: /Ghi nhận liên hệ/ }).click();
    await mutation(seller, `/seller/orders/${orderId}/contact-attempts`, () => seller.getByRole('button', { name: 'Lưu liên hệ', exact: true }).click());
    await expect(seller.getByRole('dialog')).toHaveCount(0);
    await seller.getByRole('button', { name: 'Chấp nhận đơn hàng', exact: true }).click();
    await seller.locator('#sellerorderdetailpage-field-4').selectOption(pickupId);
    await seller.getByRole('button', { name: 'Ngày mai', exact: true }).click();
    const accepted = await mutation(seller, `/seller/orders/${orderId}/accept`, () => seller.getByRole('button', { name: 'Xác nhận duyệt đơn', exact: true }).click());
    expect(accepted.status).toBe('ACCEPTED');
    await expect(seller.getByRole('dialog')).toHaveCount(0);
  }
  async function prepareAndReady(orderId: string) {
    await mutation(seller, `/seller/orders/${orderId}/prepare`, () => seller.getByRole('button', { name: /Chuyển sang.*Đang chuẩn bị/ }).click());
    await mutation(seller, `/seller/orders/${orderId}/ready`, () => seller.getByRole('button', { name: /Chuyển sang.*Sẵn sàng/ }).click());
  }
  try {
    await step('01. Đăng nhập seller qua Supabase thật', seller, async () => {
      await seller.goto('/login');
      await seller.locator('#loginEmail').fill(process.env.E2E_SELLER_EMAIL!);
      await seller.locator('#loginPass').fill(process.env.E2E_SELLER_PASSWORD!);
      await seller.locator('main form button[type="submit"]').click();
      await expect(seller).toHaveURL(baseURL + '/');
      await seller.goto('/seller');
      await expect(seller.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
    });
    await step('02. Tạo điểm nhận hàng qua giao diện', seller, async () => {
      await seller.goto('/seller/settings');
      await seller.getByRole('button', { name: 'Thêm điểm nhận', exact: true }).click();
      await seller.getByRole('dialog').locator('input[type="text"]').fill('Điểm nhận Playwright');
      const point = await mutation(seller, '/seller/pickup-points', () => seller.getByRole('dialog').locator('button[type="submit"]').click());
      pickupId = point.id;
      await expect(seller.getByRole('dialog')).toHaveCount(0);
      await expect(seller.locator('.pickup-points-list')).toContainText('Điểm nhận Playwright');
    });
    const image = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#dee8c8' } }).png().toBuffer();
    await step('03. Upload ảnh QR, cấu hình ngân hàng kiểm thử và mở nhận đơn', seller, async () => {
      await seller.locator('#sellersettingspage-field-1').fill('Shop kiểm thử Playwright');
      await seller.locator('#sellersettingspage-field-2').fill('0912345678');
      await seller.locator('#sellersettingspage-field-3').fill('playwright@example.com');
      await seller.locator('#sellersettingspage-field-4').fill('PLAYWRIGHT TEST BANK');
      await seller.locator('#sellersettingspage-field-5').fill('0000000000');
      await seller.locator('#sellersettingspage-field-6').fill('TEST ONLY NO REAL PAYMENT');
      await mutation(seller, '/seller/assets', () => seller.locator('input[type="file"]').setInputFiles({ name: 'test-qr.png', mimeType: 'image/png', buffer: image }));
      await expect(seller.getByText('Đã gắn Asset QR', { exact: true })).toBeVisible();
      await seller.locator('main input[type="checkbox"]').check();
      const shop = await mutation(seller, '/seller/shop-settings', () => seller.locator('main form').first().locator('button[type="submit"]').click());
      expect(shop.acceptingOrders).toBe(true);
    });
    await buyer.goto('/');
    await step('04. Upload ảnh và tạo sản phẩm nháp: 12.000đ, tồn 8', seller, async () => {
      await seller.goto('/seller/products/new');
      await mutation(seller, '/seller/assets', () => seller.locator('input[type="file"]').setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: image }));
      await expect(seller.getByText('Đã tải ảnh', { exact: true })).toBeVisible();
      await seller.locator('#sellerproducteditpage-field-1').fill(name);
      const category = await seller.locator('#sellerproducteditpage-field-2 option').nth(1).getAttribute('value');
      await seller.locator('#sellerproducteditpage-field-2').selectOption(category!);
      await seller.locator('#sellerproducteditpage-field-3').fill('12000');
      await seller.locator('#sellerproducteditpage-field-4').fill('8');
      const product = await mutation(seller, '/seller/products', () => seller.locator('main form button[type="submit"]').click());
      productId = product.id;
      expect(product.status).toBe('DRAFT');
      await expect(seller).toHaveURL(baseURL + '/seller/products');
      await expect(seller.getByRole('row').filter({ hasText: name })).toContainText('Bản nháp');
      await expect(buyer.getByRole('heading', { name, exact: true })).toHaveCount(0);
    });
    await step('05. Mở bán; sản phẩm tự xuất hiện ở tab khách đang mở', buyer, async () => {
      await mutation(seller, `/seller/products/${productId}/activate`, () => seller.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Mở bán', exact: true }).click());
      await buyer.bringToFront();
      await expect(buyer.getByRole('heading', { name, exact: true })).toBeVisible();
      const imageElement = buyer.getByRole('img', { name, exact: true });
      await expect(imageElement).toBeVisible();
      await expect.poll(() => imageElement.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    });
    await step('06. Sửa giá thành 15.000đ; tab khách tự cập nhật', buyer, async () => {
      await seller.goto(`/seller/products/${productId}/edit`);
      await expect(seller.locator('#sellerproducteditpage-field-3')).toHaveValue('12000');
      await seller.locator('#sellerproducteditpage-field-3').fill('15000');
      await mutation(seller, `/seller/products/${productId}`, () => seller.locator('main form button[type="submit"]').click());
      await buyer.bringToFront();
      const card = buyer.locator('.product-card').filter({ hasText: name });
      await expect(card).toContainText('15.000');
    });
    await step('07. Mở chi tiết, thêm 2 sản phẩm vào giỏ, giữ giỏ sau reload', buyer, async () => {
      await buyer.getByRole('heading', { name, exact: true }).click();
      await expect(buyer.locator('.detail-price')).toContainText('15.000');
      await buyer.getByRole('button', { name: /Tăng số lượng/ }).click();
      await buyer.getByRole('button', { name: /Thêm.*vào giỏ/ }).click();
      await expect(buyer.locator('.feedback-notice')).toContainText('Đã thêm');
      await buyer.goto('/cart');
      await expect(buyer.locator('.cart-item-card')).toHaveCount(1);
      await expect(buyer.locator('.summary-total')).toContainText('30.000');
      await buyer.reload();
      await expect(buyer.locator('.summary-total')).toContainText('30.000');
    });
    await step('08. Đặt mua chuyển khoản: đơn UNPAID, giữ 2 hàng, giỏ được xóa', buyer, async () => {
      await buyer.goto('/checkout');
      await buyer.locator('#fullName').fill('Khách kiểm thử Playwright');
      await buyer.locator('#phone').fill('0912345678');
      await buyer.locator('#email').fill('buyer-playwright@example.com');
      await buyer.locator('input[value="BANK_TRANSFER"]').check();
      await expect(buyer.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
      const order = await mutation(buyer, '/orders', () => buyer.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click());
      bankOrderId = order.orderId;
      expect(order.paymentStatus).toBe('UNPAID');
      expect(order.total).toBe(30000);
      await expect(buyer).toHaveURL(baseURL + '/order-success');
      const saved = await state();
      expect(saved.orders).toHaveLength(1);
      expect(saved.products[0].stock_reserved).toBe(2);
      expect(await buyer.evaluate(() => JSON.parse(localStorage.getItem('school_shop_cart_v1') || '[]'))).toEqual([]);
      await openGuestOrder(buyer);
      await expect(buyer.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true })).toHaveCount(0);
    });
    await step('09. Seller nhìn thấy đơn, ghi nhận liên hệ và chấp nhận', seller, async () => {
      await seller.goto('/seller/orders');
      const saved = await state();
      await expect(seller.getByRole('row').filter({ hasText: saved.orders[0].order_code })).toBeVisible();
      await acceptOrder(bankOrderId);
    });
    await step('10. Khách nhận QR và báo chuyển; trạng thái chỉ là REPORTED', buyer, async () => {
      await buyer.bringToFront();
      await expect(buyer.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true })).toBeVisible();
      await expect(buyer.locator('.payment-instructions-panel')).toContainText('PLAYWRIGHT TEST BANK');
      const qr = buyer.getByRole('img', { name: 'Mã QR Chuyển khoản', exact: true });
      await expect.poll(() => qr.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      const code = (await state()).orders[0].order_code;
      await mutation(buyer, `/guest/orders/${code}/payment-report`, () => buyer.getByRole('button', { name: 'Tôi đã chuyển khoản', exact: true }).click());
      await expect(buyer.locator('.header-status-badges')).toContainText('Đã báo chuyển khoản');
      const saved = await state();
      expect(saved.orders[0].payment_status).toBe('REPORTED');
      expect(Number(saved.orders[0].received_amount)).toBe(0);
    });
    await step('11. Chuẩn bị và sẵn sàng; không cho hoàn tất khi chưa PAID', seller, async () => {
      await seller.bringToFront();
      await expect(seller.locator('main')).toContainText('Đã báo chuyển khoản');
      await prepareAndReady(bankOrderId);
      await expect(seller.getByRole('button', { name: 'Bàn giao & Hoàn tất đơn', exact: true })).toBeDisabled();
    });
    await step('12. Seller xác nhận 30.000đ trong DB kiểm thử; khách thấy PAID', buyer, async () => {
      await seller.getByRole('button', { name: /Xác nhận đã thu đủ tiền/ }).click();
      await seller.locator('#sellerorderdetailpage-field-9').fill('PLAYWRIGHT-NO-REAL-TRANSFER');
      await seller.locator('#sellerorderdetailpage-field-10').fill('Mô phỏng trên DB kiểm thử, không có tiền thật.');
      const paid = await mutation(seller, `/seller/orders/${bankOrderId}/confirm-payment`, () => seller.getByRole('button', { name: 'Xác nhận PAID', exact: true }).click());
      expect(paid.paymentStatus).toBe('PAID');
      expect(paid.receivedAmount).toBe(30000);
      await buyer.bringToFront();
      await expect(buyer.locator('.header-status-badges')).toContainText('Đã thanh toán');
    });
    await step('13. Hoàn tất đơn; khách tự cập nhật, tồn còn 6 và hết giữ hàng', buyer, async () => {
      await mutation(seller, `/seller/orders/${bankOrderId}/complete`, () => seller.getByRole('button', { name: 'Bàn giao & Hoàn tất đơn', exact: true }).click());
      await buyer.bringToFront();
      await expect(buyer.locator('.header-status-badges')).toContainText('Hoàn tất');
      const saved = await state();
      expect(saved.products[0].stock_on_hand).toBe(6);
      expect(saved.products[0].stock_reserved).toBe(0);
      expect(saved.orders[0].status).toBe('COMPLETED');
    });
    await step('14. Mua 1 sản phẩm bằng tiền mặt và hoàn tất đối soát', buyer, async () => {
      await buyer.goto(`/products/${productId}`);
      await buyer.getByRole('button', { name: /Thêm.*vào giỏ/ }).click();
      await expect(buyer.locator('.feedback-notice')).toContainText('Đã thêm');
      await buyer.goto('/checkout');
      await buyer.locator('#fullName').fill('Khách tiền mặt Playwright');
      await buyer.locator('#phone').fill('0912345678');
      await buyer.locator('#email').fill('cash-playwright@example.com');
      await buyer.locator('input[value="CASH"]').check();
      await expect(buyer.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true })).toBeEnabled();
      const order = await mutation(buyer, '/orders', () => buyer.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click());
      // CreateOrderResponse contains IDs/status/total, not the payment method.
      expect((await state()).orders.at(-1)?.payment_method).toBe('CASH');
      expect(order.total).toBe(15000);
      await expect(buyer).toHaveURL(baseURL + '/order-success');
      await openGuestOrder(buyer);
      await acceptOrder(order.orderId);
      await prepareAndReady(order.orderId);
      await expect(seller.getByRole('button', { name: 'Bàn giao & Hoàn tất đơn', exact: true })).toBeDisabled();
      await seller.getByRole('button', { name: /Xác nhận đã thu đủ tiền/ }).click();
      await seller.locator('#sellerorderdetailpage-field-10').fill('Tiền mặt mô phỏng trong DB kiểm thử.');
      await mutation(seller, `/seller/orders/${order.orderId}/confirm-payment`, () => seller.getByRole('button', { name: 'Xác nhận PAID', exact: true }).click());
      await expect(seller.getByRole('dialog')).toHaveCount(0);
      await mutation(seller, `/seller/orders/${order.orderId}/complete`, () => seller.getByRole('button', { name: 'Bàn giao & Hoàn tất đơn', exact: true }).click());
      await buyer.bringToFront();
      await expect(buyer.locator('.header-status-badges')).toContainText('Hoàn tất');
      const saved = await state();
      expect(saved.products[0].stock_on_hand).toBe(5);
      expect(saved.products[0].stock_reserved).toBe(0);
      expect(saved.orders).toHaveLength(2);
      expect(saved.orders.every(order => order.status === 'COMPLETED' && order.payment_status === 'PAID')).toBe(true);
      expect(saved.audit.some(event => event.action === 'ORDER_CREATED')).toBe(true);
    });
    await step('15. Ẩn sản phẩm; gian hàng tự gỡ sản phẩm', buyer, async () => {
      await buyer.goto('/');
      await expect(buyer.getByRole('heading', { name, exact: true })).toBeVisible();
      await seller.goto('/seller/products');
      await mutation(seller, `/seller/products/${productId}/archive`, () => seller.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Ẩn', exact: true }).click());
      await buyer.bringToFront();
      await expect(buyer.getByRole('heading', { name, exact: true })).toHaveCount(0);
      expect((await state()).products[0].status).toBe('ARCHIVED');
    });
    expect(apiErrors).toEqual([]);
  } finally {
    const finalState = await state().catch(() => null);
    const cleanup = await request.post(`${backendURL}/__e2e/cleanup`, { headers: { 'x-e2e-key': key } });
    const cleanupResult = await cleanup.json().catch(() => null);
    await fs.writeFile(testInfo.outputPath('flow-result.json'), JSON.stringify({ environment: 'Local UI + production services + isolated PostgreSQL WASM + real Supabase Auth/Storage', results, apiErrors, finalState, cleanup: cleanupResult }, null, 2));
    await sellerContext.close();
    await buyerContext.close();
    expect(cleanup.ok(), 'Temporary Supabase storage objects must be removed').toBeTruthy();
  }
});
