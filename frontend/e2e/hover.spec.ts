import { test, expect, ids } from './fixtures';
import type { Locator, Page } from '@playwright/test';

async function appearance(target: Locator) {
  return target.evaluate(el => {
    const css = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { background: css.backgroundColor, color: css.color, border: css.borderColor,
      transform: css.transform, shadow: css.boxShadow, opacity: css.opacity,
      x: rect.x, y: rect.y, documentX: rect.x + scrollX, documentY: rect.y + scrollY,
      width: rect.width, height: rect.height };
  });
}
async function settle(page: Page) { await page.waitForTimeout(320); }
async function park(page: Page) { await page.mouse.move(0, 0); await settle(page); }

const routeGroups = [
  ['public', '/', '/products/banh-thu', '/combos/combo-thu', '/cart', '/checkout', '/guest-order', '/login', '/register', '/forgot-password'],
  ['CUSTOMER', '/account/profile', '/account/orders', `/account/orders/${ids.order}`],
  ['SELLER', '/seller', '/seller/products', '/seller/products/new', `/seller/products/${ids.product}/edit`, '/seller/combos', '/seller/combos/new', `/seller/combos/${ids.combo}/edit`, '/seller/orders', `/seller/orders/${ids.order}`, '/seller/settings', '/seller/logs'],
];
for (const [role, ...paths] of routeGroups) {
  for (const path of paths) {
    test(`hover audit ${role} ${path}`, async ({ page, scenario }) => {
      if (role !== 'public') await scenario.authenticate(role as 'CUSTOMER' | 'SELLER');
      await scenario.cart();
      await page.goto(path);
      await expect(page.locator('main h1, main h2')).not.toHaveCount(0);
      await expect(page.locator('main .loading-container')).toHaveCount(0);
      const candidates = page.locator('main a, main button, main select, main tbody tr, main .product-card, main .combo-card, footer a');
      const seen = new Set<string>();
      for (const target of await candidates.all()) {
        if (!await target.isVisible()) continue;
        const key = await target.evaluate(el => `${el.tagName}:${el.className}`);
        if (seen.has(key)) continue;
        seen.add(key);
        await target.scrollIntoViewIfNeeded();
        await park(page);
        const before = await appearance(target);
        await target.hover();
        await settle(page);
        const after = await appearance(target);
        expect(after.opacity, key).not.toBe('0');
        expect(after.width, key).toBeCloseTo(before.width, 0);
        expect(after.height, key).toBeCloseTo(before.height, 0);
        expect(after.documentY, key).toBeCloseTo(before.documentY, 0);
        expect(after.documentX, key).toBeCloseTo(before.documentX, 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), key).toBe(true);
      }
    });
  }
}

test('cards and buttons keep a stable hit area at their lower edge', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['.product-card', '.combo-card', '.hero-copy .btn-primary']) {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    await park(page);
    const before = await appearance(target);
    await page.mouse.move(before.x + before.width / 2, before.y + before.height - 1);
    await settle(page);
    const after = await appearance(target);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
    const mouseHover = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
    if (selector.includes('btn-primary')) {
      if (mouseHover) expect(after.background).not.toBe(before.background);
      else expect(after.background).toBe(before.background);
    }
    if (mouseHover) {
      expect(await target.evaluate(el => el.matches(':hover'))).toBe(true);
    }
  }
});

test('disabled buttons retain their appearance on hover', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const surface = document.createElement('div');
    surface.style.cssText = 'position:fixed;inset:120px 20px auto;z-index:500;display:flex;flex-wrap:wrap;gap:12px;background:var(--bg-card);padding:16px';
    surface.id = 'disabled-controls';
    for (const name of ['btn-primary', 'btn-primary-sm', 'btn-primary-xs', 'btn-secondary', 'btn-secondary-sm', 'btn-secondary-xs', 'btn-danger', 'empty-action-btn', 'product-add']) {
      const button = document.createElement('button');
      button.className = name;
      button.disabled = true;
      button.textContent = name;
      surface.append(button);
    }
    document.body.append(surface);
  });
  for (const target of await page.locator('#disabled-controls button').all()) {
    await park(page);
    const before = await appearance(target);
    await target.hover();
    await settle(page);
    expect(await appearance(target)).toEqual(before);
  }
});

test('cart loading and success icons are not rotated by button hover', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('.product-add').first();
  await expect(button).toBeEnabled();
  await button.hover();
  await expect(button).toHaveCSS('transform', 'none');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/v1/products/${ids.product}`, async route => { await gate; await route.fallback(); });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toHaveCSS('transform', 'none');
  release();
  await expect(button).toHaveAttribute('data-cart-state', 'added');
  await button.hover();
  await expect(button).toHaveCSS('transform', 'none');
});

test('touch and reduced motion avoid hover movement and preserve keyboard focus', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.locator('.product-card').first();
  await card.hover();
  await expect(card).toHaveCSS('transform', 'none');
  const button = card.locator('.product-add');
  await button.focus();
  expect(await button.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThan(0);
  await button.hover();
  await expect(button).toHaveCSS('transform', 'none');
  if (testInfo.project.use.isMobile) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await park(page);
    const before = await appearance(button);
    await button.hover();
    await settle(page);
    expect(await appearance(button)).toEqual(before);
  }
});

test('image zoom is confined to the image and respects touch and reduced motion', async ({ page, scenario }) => {
  scenario.products[0].imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#dee8c8"/></svg>');
  await page.goto('/');
  const card = page.locator('.product-card').first();
  const image = card.locator('img');
  await expect(image).toBeVisible();
  await card.hover();
  await settle(page);
  const canHover = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
  const scale = await image.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
  expect(scale).toBeCloseTo(canHover ? 1.045 : 1, 3);
  await expect(card).toHaveCSS('transform', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(image).toHaveCSS('transform', 'none');
});
