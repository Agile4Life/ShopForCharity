import { test, expect, product } from './fixtures';

test('sections reveal on scroll once and keep the page within the viewport', async ({ page }, testInfo) => {
  await page.goto('/');
  const steps = page.locator('.workshop-steps > li');
  await expect(steps.last()).toHaveClass(/reveal-ready/);
  await expect(steps.last()).toHaveCSS('opacity', '0');
  await steps.last().scrollIntoViewIfNeeded();
  await expect(steps.last()).toHaveClass(/is-visible/);
  await expect(steps.last()).toHaveCSS('opacity', '1');
  await expect(steps.last()).toHaveCSS('translate', 'none');
  await page.screenshot({ path: testInfo.outputPath('scroll-reveal.png') });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(steps.last()).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a tall surface reveals when its top enters the viewport', async ({ page, scenario }) => {
  scenario.combos = [];
  await page.goto('/');
  const surface = page.locator('.combo-coming-soon');
  await expect(surface).toHaveClass(/reveal-ready/);
  await page.addStyleTag({ content: '.combo-coming-soon { min-height: 14000px; }' });
  await surface.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await expect(surface).toHaveCSS('opacity', '1');
});

test('keyboard focus reveals an offscreen action without requiring scrolling', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.combo-card').first();
  await expect(card).toHaveClass(/reveal-ready/);
  const action = card.getByRole('button', { name: 'Thêm combo vào giỏ', exact: true });
  await action.evaluate(el => (el as HTMLElement).focus({ preventScroll: true }));
  await expect(action).toBeFocused();
  await expect(card).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('reduced motion shows every surface immediately, including a changed preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const steps = page.locator('.workshop-steps > li');
  await expect(steps.last()).toHaveCSS('opacity', '1');
  await expect(steps.last()).toHaveCSS('translate', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(steps.last()).toHaveCSS('opacity', '0');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(steps.last()).toHaveCSS('opacity', '1');
  await expect(page.locator('main > div')).toHaveCSS('animation-name', 'none');
});

test('late catalog results reveal individually and remain actionable after navigation', async ({ page, scenario }) => {
  scenario.products = Array.from({ length: 12 }, (_, i) => ({ ...product, id: `motion-${i}`, slug: `motion-${i}`, name: `Món ${i + 1}` }));
  await page.route('**/api/v1/products?**', async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.fallback();
  });
  await page.goto('/');
  const cards = page.locator('.product-card');
  await expect(cards).toHaveCount(12);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last()).toHaveCSS('opacity', '1');
  await cards.last().getByRole('link', { name: 'Món 12', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Món 12', exact: true })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Gian hàng', exact: true }).click();
  await expect(page).toHaveURL('/#catalog');
  await expect(page.locator('#catalog-title')).toBeInViewport();
  await expect(cards.first()).toHaveCSS('opacity', '1');
});

test('missing IntersectionObserver leaves content readable', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'IntersectionObserver', { value: undefined }));
  await page.goto('/');
  await expect(page.locator('.workshop-steps > li').last()).toHaveCSS('opacity', '1');
  await expect(page.locator('.reveal-ready')).toHaveCount(0);
});

test('scrollbars share the paper and forest theme with accessible high contrast', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { scrollbar: style.scrollbarColor, ink: style.getPropertyValue('--ink').trim(), gutter: style.scrollbarGutter };
  });
  expect(colors.scrollbar).toBe('rgb(113, 133, 105) rgb(255, 248, 232)');
  expect(colors.ink).toBe('#284b37');
  expect(colors.gutter).toBe('stable');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('html')).toHaveCSS('scrollbar-color', 'auto');
});
