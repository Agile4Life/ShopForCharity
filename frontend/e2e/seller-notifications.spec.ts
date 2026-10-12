import type { Page, WebSocketRoute } from '@playwright/test';
import { test, expect, ids, type Scenario } from './fixtures';
import type { NotificationItem } from '../src/types/api';

const sellerTopic = `realtime:seller:notifications:${ids.user}`;
const alert = (id: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id, recipientProfileId: ids.user, type: 'ORDER_CREATED', orderId: ids.order,
  orderCode: `ORD-${id}`, buyerName: 'Khách đặt đơn', orderTotal: 10000,
  isRead: false, createdAt: new Date().toISOString(), ...overrides,
});

// Exercise the real supabase-js channel with Phoenix WebSocket frames. HTTP
// fixtures remain the authority for order content, just as the production API.
async function transport(page: Page, scenario: Scenario) {
  const channels = new Map<string, { socket: WebSocketRoute; joinRef: string }>();
  let snapshots = 0;
  await page.routeWebSocket('**/realtime/v1/websocket*', socket => {
    socket.onMessage(raw => {
      if (typeof raw !== 'string') return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(raw);
      if (event === 'phx_join') {
        if (topic === sellerTopic) expect(payload.config.private).toBe(true);
        channels.set(topic, { socket, joinRef });
      }
      if (event === 'phx_leave') channels.delete(topic);
      if (event === 'phx_join' || event === 'phx_leave' || event === 'heartbeat') {
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }]));
      }
    });
  });
  await page.route('**/api/v1/seller/notifications?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('unreadOrders') !== 'true') return route.fallback();
    snapshots++;
    const pending = scenario.notifications.filter(n => !n.isRead && n.type === 'ORDER_CREATED');
    const pageIndex = Number(url.searchParams.get('page') || 0), size = Number(url.searchParams.get('size') || 20);
    await route.fulfill({ json: { content: pending.slice(pageIndex * size, (pageIndex + 1) * size), page: pageIndex,
      size, totalElements: pending.length, totalPages: Math.ceil(pending.length / size) } });
  });
  const changed = () => {
    const joined = channels.get(sellerTopic)!;
    joined.socket.send(JSON.stringify([joined.joinRef, null, sellerTopic, 'broadcast',
      { type: 'broadcast', event: 'changed', payload: { notificationId: 'changed' } }]));
  };
  return {
    channels,
    snapshots: () => snapshots,
    ready: async () => {
      await expect.poll(() => channels.has(sellerTopic)).toBe(true);
      await expect.poll(() => snapshots).toBeGreaterThan(0);
      await page.waitForTimeout(200);
      // A subscription refresh can share the initial HTTP request. Explicitly
      // request a snapshot instead of assuming two requests always occur.
      const before = snapshots;
      changed();
      await expect.poll(() => snapshots).toBeGreaterThan(before);
      await page.waitForTimeout(200);
    },
    changed,
  };
}

test('seller gets popup on another page and opens the order immediately', async ({ page, scenario }, testInfo) => {
  await scenario.authenticate('SELLER');
  const realtime = await transport(page, scenario);
  await page.goto('/seller/products');
  await realtime.ready();
  scenario.notifications = [alert('NEW-ORDER')];
  realtime.changed();
  const popup = page.locator('.seller-order-alert');
  await expect(popup).toContainText('Có đơn hàng mới!');
  await expect(popup).toContainText('ORD-NEW-ORDER');
  await expect(popup).toContainText('Khách đặt đơn');
  await expect(popup).toContainText('10.000 đ');
  const box = await popup.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (page.viewportSize()!.width <= 760) {
    expect(box!.y).toBeLessThan(page.viewportSize()!.height / 3);
    const navigation = await page.locator('.seller-workspace-bar').boundingBox();
    if (navigation) expect(box!.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
  } else {
    expect(box!.y + box!.height).toBeGreaterThan(page.viewportSize()!.height - 175);
  }
  expect(box!.y).toBeGreaterThan(80);
  const chat = await page.locator('.chat-launcher').boundingBox();
  if (chat) expect(box!.y + box!.height).toBeLessThan(chat.y - 8);
  await page.screenshot({ path: testInfo.outputPath('seller-new-order-popup.png') });
  await popup.getByRole('link', { name: 'Xử lý đơn' }).click();
  await expect(page).toHaveURL(`/seller/orders/${ids.order}`);
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
  await expect.poll(() => scenario.mutations('/read').length).toBe(1);
  await expect(popup).toHaveCount(0);
});

test('initial unread orders stay on dashboard; repeated events and navigation do not duplicate popups', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  scenario.notifications = [alert('OLD')];
  const realtime = await transport(page, scenario);
  await page.goto('/seller');
  await realtime.ready();
  await expect(page.locator('.seller-order-alert')).toHaveCount(0);
  scenario.notifications.unshift(alert('NEW'));
  realtime.changed();
  await expect(page.locator('.seller-order-alert')).toHaveCount(1);
  realtime.changed(); realtime.changed(); realtime.changed();
  await page.locator('a[href="/seller/products"]').first().click();
  await expect(page).toHaveURL('/seller/products');
  await expect(page.locator('.seller-order-alert')).toHaveCount(1);
  await page.getByRole('button', { name: 'Đóng thông báo đơn hàng' }).click();
  realtime.changed();
  await expect(page.locator('.seller-order-alert')).toHaveCount(0);
  expect(scenario.mutations('/read')).toHaveLength(0);
});

test('queue retains a burst across multiple API pages and promotes the next popup', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const realtime = await transport(page, scenario);
  await page.goto('/seller/settings');
  await realtime.ready();
  scenario.notifications = Array.from({ length: 105 }, (_, i) => alert(`BURST-${105 - i}`));
  realtime.changed();
  await expect(page.locator('.seller-order-alert')).toHaveCount(3);
  await expect(page.locator('.seller-order-alert-overflow')).toContainText('102');
  await expect(page.locator('.seller-order-alert').first()).toContainText('ORD-BURST-1');
  await page.getByRole('button', { name: 'Đóng thông báo đơn hàng' }).first().click();
  await expect(page.locator('.seller-order-alert').last()).toContainText('ORD-BURST-4');
  await expect(page.locator('.seller-order-alert-overflow')).toContainText('101');
});

test('fallback poll receives orders while WebSocket is unavailable', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  await page.routeWebSocket('**/realtime/v1/websocket*', socket => socket.close());
  await page.clock.install();
  await page.goto('/seller/products');
  await expect.poll(() => scenario.calls.filter(r => r.url().includes('unreadOrders=true')).length).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  scenario.notifications = [alert('FALLBACK')];
  await page.clock.fastForward(10_100);
  await expect(page.locator('.seller-order-alert')).toContainText('ORD-FALLBACK');
});

test('mark-read failure does not stop opening the order', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const realtime = await transport(page, scenario);
  await page.route('**/seller/notifications/*/read', route => route.fulfill({ status: 503,
    json: { code: 'SERVICE_UNAVAILABLE', message: 'Vui lòng thử lại.' } }));
  await page.goto('/seller/products');
  await realtime.ready();
  scenario.notifications = [alert('READ-FAIL')];
  realtime.changed();
  await page.locator('.seller-order-alert').getByRole('link', { name: 'Xử lý đơn' }).click();
  await expect(page).toHaveURL(`/seller/orders/${ids.order}`);
  await expect(page.getByRole('heading', { name: 'ORD-TEST001', exact: true })).toBeVisible();
  expect(scenario.notifications[0].isRead).toBe(false);
});

test('reading from another tab removes its popup', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const realtime = await transport(page, scenario);
  await page.goto('/seller/products');
  await realtime.ready();
  scenario.notifications = [alert('OTHER-TAB')];
  realtime.changed();
  await expect(page.locator('.seller-order-alert')).toHaveCount(1);
  scenario.notifications[0].isRead = true;
  realtime.changed();
  await expect(page.locator('.seller-order-alert')).toHaveCount(0);
});

for (const role of ['GUEST', 'CUSTOMER'] as const) {
  test(`${role} never subscribes to seller notifications or fetches seller alerts`, async ({ page, scenario }) => {
    if (role === 'CUSTOMER') await scenario.authenticate(role);
    const realtime = await transport(page, scenario);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /^Giỏ hàng/ }).first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(realtime.channels.has(sellerTopic)).toBe(false);
    expect(realtime.snapshots()).toBe(0);
    await expect(page.locator('.seller-order-alert')).toHaveCount(0);
  });
}

test('seller receives orders on the storefront and logout clears the popup and channel', async ({ page, scenario }) => {
  await scenario.authenticate('SELLER');
  const realtime = await transport(page, scenario);
  await page.goto('/');
  await realtime.ready();
  scenario.notifications = [alert('STOREFRONT')];
  realtime.changed();
  await expect(page.locator('.seller-order-alert')).toContainText('ORD-STOREFRONT');
  await page.getByRole('button', { name: 'Menu tài khoản', exact: true }).click();
  if (page.viewportSize()!.width <= 760) await expect(page.locator('.seller-order-alert')).toBeHidden();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).first().click();
  await expect(page.locator('.seller-order-alert')).toHaveCount(0);
  await expect.poll(() => realtime.channels.has(sellerTopic)).toBe(false);
  const snapshots = realtime.snapshots();
  await page.clock.install();
  await page.clock.fastForward(10_100);
  expect(realtime.snapshots()).toBe(snapshots);
});
