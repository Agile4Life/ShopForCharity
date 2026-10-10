import { test as base, expect, type Page, type Request } from '@playwright/test';
import type { ProductDetail, ComboDetail, OrderDetail, Profile, ShopInfo, NotificationItem } from '../src/types/api';

export const ids = {
  product: '00000000-0000-4000-8000-000000000021', other: '00000000-0000-4000-8000-000000000022',
  combo: '00000000-0000-4000-8000-000000000031', pickup: '00000000-0000-4000-8000-000000000041',
  order: '00000000-0000-4000-8000-000000000051', category: '00000000-0000-4000-8000-000000000011',
  user: '00000000-0000-4000-8000-000000000061',
};
export const product: ProductDetail = {
  id: ids.product, slug: 'banh-thu', name: 'Bánh thử', description: 'Bánh gây quỹ',
  price: 10000, categoryId: ids.category, categoryName: 'Đồ ăn vặt', availableStock: 10,
  isSoldOut: false, status: 'ACTIVE', version: 2, inventoryVersion: 4, stockOnHand: 12, stockReserved: 2,
};
export const combo: ComboDetail = {
  id: ids.combo, slug: 'combo-thu', name: 'Combo thử', description: 'Gói gây quỹ',
  price: 25000, availableStock: 5, isSoldOut: false, status: 'ACTIVE', version: 3,
  items: [{ productId: ids.product, productName: product.name, quantity: 1 },
    { productId: ids.other, productName: 'Móc khóa thử', quantity: 1 }],
};
export const profile: Profile = {
  id: ids.user, authUserId: ids.user, fullName: 'Nguyễn Văn Test', phone: '0912345678',
  email: 'test@example.com', role: 'CUSTOMER', active: true, version: 3,
};
const user = { id: ids.user, aud: 'authenticated', role: 'authenticated', email: profile.email,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const session = () => ({ access_token: 'e2e-access-token', refresh_token: 'e2e-refresh-token',
  token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });
const pageOf = <T>(content: T[]) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 });

// Browser-flow fixtures isolate each test from real accounts, email, money and databases.
// Backend rules are tested independently in JUnit/PostgreSQL, not reimplemented here.
export class Scenario {
  calls: Request[] = [];
  unexpected: string[] = [];
  role: 'GUEST' | 'CUSTOMER' | 'SELLER' = 'GUEST';
  sessionError = false;
  quoteUnavailable = false;
  quoteExpired = false;
  orderError = false;
  loginError = false;
  accessError = false;
  shop: ShopInfo & { version: number } = { id: 'shop-test', name: 'Shop gây quỹ',
    contactPhone: '0912345678', contactEmail: 'shop@example.com', acceptingOrders: true, version: 2,
    pickupPoints: [{ id: ids.pickup, name: 'Cổng trường', instructions: 'Gặp tại cổng', active: true, version: 5 }] };
  products = [structuredClone(product), { ...product, id: ids.other, slug: 'moc-khoa-thu', name: 'Móc khóa thử' }];
  combos = [structuredClone(combo)];
  notifications: NotificationItem[] = [];
  me = structuredClone(profile);
  order: OrderDetail = {
    id: ids.order, orderCode: 'ORD-TEST001', buyerName: profile.fullName, buyerPhone: profile.phone,
    buyerEmail: profile.email, pickupPointName: 'Cổng trường', paymentMethod: 'CASH', paymentStatus: 'UNPAID',
    status: 'PENDING_CONTACT', subtotal: 10000, total: 10000, receivedAmount: 0, version: 7,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    reservationExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    items: [{ id: 'item-test', kind: 'PRODUCT', productId: ids.product, nameSnapshot: product.name,
      unitPrice: 10000, quantity: 1, lineTotal: 10000 }], statusHistory: [], contactAttempts: [], paymentEvents: [],
  };
  constructor(private page: Page, private origin = 'http://127.0.0.1:4173') {}
  async authenticate(role: 'CUSTOMER' | 'SELLER') {
    this.role = role;
    this.me.role = role;
    await this.page.addInitScript(value => {
      if (!sessionStorage.getItem('e2e-auth-seeded')) {
        localStorage.setItem('sb-127-auth-token', JSON.stringify(value));
        sessionStorage.setItem('e2e-auth-seeded', 'true');
      }
    }, session());
  }
  async cart() {
    await this.page.addInitScript(value => localStorage.setItem('school_shop_cart_v1', JSON.stringify(value)),
      [{ kind: 'PRODUCT', catalogId: ids.product, name: product.name, price: product.price, quantity: 1 }]);
  }
  mutations(path: string) { return this.calls.filter(r => new URL(r.url()).pathname.endsWith(path) && r.method() !== 'GET'); }
  async install() {
    await this.page.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (!url.pathname.startsWith('/api/v1') && !url.pathname.startsWith('/auth/v1')) {
        if (url.origin !== this.origin) return route.abort();
        return route.continue();
      }
      this.calls.push(req);
      const path = url.pathname.replace('/api/v1', '');
      const method = req.method();
      const body = method === 'GET' || path === '/seller/assets' ? {} : req.postDataJSON() || {};
      const ok = (data: unknown) => route.fulfill({ status: 200, json: data });
      const error = (status: number, code: string) => route.fulfill({ status, json: { code, message: code } });
      if (url.pathname.startsWith('/auth/v1')) {
        if (url.pathname.endsWith('/token')) return this.loginError ? error(400, 'Invalid login credentials') : ok(session());
        if (url.pathname.endsWith('/signup')) return ok({ user, session: null });
        if (url.pathname.endsWith('/recover') || url.pathname.endsWith('/logout')) return ok({});
        if (url.pathname.endsWith('/user')) return ok(user);
      }
      if (path === '/me') {
        if (method === 'PATCH') this.me = { ...this.me, ...body, version: this.me.version! + 1 };
        return ok(this.me);
      }
      if (path === '/shop') return ok(this.shop);
      if (path === '/categories') return ok([{ id: ids.category, code: 'SNACK', name: 'Đồ ăn vặt', active: true }]);
      if (path === '/checkout/session') return this.sessionError ? error(503, 'SESSION_UNAVAILABLE') : ok({ success: true });
      if (path === '/checkout/quote') {
        const items = body.items.map((line: { kind: string; catalogId: string; quantity: number }) => {
          const p = [...this.products, ...this.combos].find(p => p.id === line.catalogId)!;
          return { ...line, name: p.name, unitPrice: p.price, lineTotal: p.price * line.quantity,
            availableStock: this.quoteUnavailable ? 0 : p.availableStock, isAvailable: !this.quoteUnavailable };
        });
        const total = items.reduce((sum: number, i: { lineTotal: number }) => sum + i.lineTotal, 0);
        return ok({ quoteToken: 'quote-test', expiresAt: new Date(Date.now() + (this.quoteExpired ? -1000 : 300000)).toISOString(), subtotal: total, total, items });
      }
      if (path === '/orders' && method === 'POST') {
        if (this.orderError) return error(409, 'INSUFFICIENT_STOCK');
        this.order.paymentMethod = body.paymentMethod;
        return ok({ ...this.order, orderId: ids.order, guestAccessToken: this.role === 'GUEST' ? 'secret-test-token' : undefined });
      }
      if (path === '/guest/orders/access') return this.accessError ? error(401, 'INVALID_GUEST_ACCESS') : ok({ success: true });
      if (path === '/seller/dashboard') return ok({ pendingCount: 1, readyCount: 0, completedRevenue: 0, pendingRevenue: 10000 });
      if (path === '/seller/notifications') return ok(pageOf(this.notifications));
      if (path.startsWith('/seller/notifications/') && path.endsWith('/read')) {
        this.notifications.find(n => path.includes(n.id))!.isRead = true;
        return ok({});
      }
      if (path === '/seller/audit-logs') return ok(pageOf([{ id: 'audit-test', action: 'ORDER_CREATED', actorType: 'GUEST', entityType: 'ORDER', entityId: ids.order, createdAt: this.order.createdAt }]));
      if (path === '/seller/shop-settings') {
        if (method === 'PATCH') this.shop = { ...this.shop, ...body, version: this.shop.version + 1 };
        return ok(this.shop);
      }
      if (path.startsWith('/seller/pickup-points')) {
        if (method === 'POST') this.shop.pickupPoints.push({ id: 'new-pickup', ...body, version: 0 });
        if (method === 'PATCH') {
          const point = this.shop.pickupPoints.find(p => path.endsWith(p.id))!;
          if (body.expectedVersion !== point.version) return error(409, 'VERSION_CONFLICT');
          Object.assign(point, body, { version: point.version! + 1 });
        }
        return ok(method === 'GET' ? this.shop.pickupPoints : this.shop.pickupPoints.at(-1));
      }
      if (path === '/seller/assets') return ok({ assetId: 'image-test', url: '/test-image.png', objectPath: 'test-image.png' });
      for (const kind of ['products', 'combos'] as const) {
        const list = kind === 'products' ? this.products : this.combos;
        const root = path.replace('/seller', '');
        if (root === `/${kind}`) {
          if (method === 'POST') {
            const entry = { ...list[0], ...body, id: `new-${kind}`, slug: `new-${kind}`, status: 'DRAFT', version: 0 };
            (list as unknown[]).push(entry);
            return ok(entry);
          }
          const q = url.searchParams.get('q')?.toLowerCase();
          return ok(pageOf(q ? list.filter(p => p.name.toLowerCase().includes(q)) : list));
        }
        if (root.startsWith(`/${kind}/`)) {
          const p = list.find(p => root.split('/')[2] === p.id || root.split('/')[2] === p.slug);
          if (!p) return error(404, 'NOT_FOUND');
          if (method === 'PATCH') Object.assign(p, body, { version: p.version + 1 });
          if (root.endsWith('/activate')) Object.assign(p, { status: 'ACTIVE', version: p.version + 1 });
          if (root.endsWith('/archive')) Object.assign(p, { status: 'ARCHIVED', version: p.version + 1 });
          if (root.endsWith('/stock-adjustments')) {
            if (body.expectedVersion !== (p as ProductDetail).inventoryVersion) return error(409, 'VERSION_CONFLICT');
            p.availableStock += body.deltaOnHand;
          }
          return ok(p);
        }
      }
      if (/^\/(me|guest|seller)\/orders/.test(path)) {
        if (path.endsWith('/orders')) return ok(pageOf([this.order]));
        if (path.endsWith('/payment-instructions')) return ok({ orderCode: this.order.orderCode, bankName: 'Demo Bank', accountNumber: '123456', accountHolder: 'DEMO SHOP', amount: this.order.total, transferContent: this.order.orderCode });
        if (method === 'POST') {
          if (body.expectedVersion !== this.order.version) return error(409, 'VERSION_CONFLICT');
          const action = path.split('/').at(-1);
          const transitions: Record<string, OrderDetail['status']> = { accept: 'ACCEPTED', prepare: 'PREPARING', ready: 'READY', complete: 'COMPLETED', reject: 'REJECTED', cancel: 'CANCELLED' };
          if (action && transitions[action]) this.order.status = transitions[action];
          if (action === 'contact-attempts') this.order.contactAttempts!.push({ ...body, id: 'contact-test', createdAt: new Date().toISOString() });
          if (action === 'payment-report') this.order.paymentStatus = 'REPORTED';
          if (action === 'dismiss-payment-report') this.order.paymentStatus = 'UNPAID';
          if (action === 'confirm-payment') { this.order.receivedAmount += body.amount; this.order.paymentStatus = 'PAID'; }
          if (action === 'confirm-refund') {
            if (body.amount !== this.order.receivedAmount) return error(400, 'INVALID_REFUND_AMOUNT');
            this.order.paymentStatus = 'REFUNDED';
          }
          if (action === 'cancel' && this.order.receivedAmount > 0) this.order.paymentStatus = 'REFUND_PENDING';
          this.order.version++;
        }
        return ok(this.order);
      }
      this.unexpected.push(`${method} ${url.pathname}`);
      return error(501, 'UNMOCKED_ENDPOINT');
    });
  }
}
export const test = base.extend<{ scenario: Scenario }>({
  scenario: [async ({ page, baseURL }, use) => {
    const scenario = new Scenario(page, new URL(baseURL!).origin);
    await scenario.install();
    await use(scenario);
    expect(scenario.unexpected, 'Every API request must have an explicit fixture').toEqual([]);
  }, { auto: true }],
});
export { expect };
export async function submit(page: Page) { await page.locator('main form button[type="submit"]').click(); }
export async function expectMutation(s: Scenario, path: string, body: Record<string, unknown>) {
  await expect.poll(() => s.mutations(path).length).toBeGreaterThan(0);
  const req = s.mutations(path).at(-1)!;
  expect(req.postDataJSON()).toMatchObject(body);
  expect(req.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
}
