import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function holdGreeting(page: Page) {
  // Freeze CSS as well as JS timers so slow asset loading cannot skip the intro.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.welcome-intro, .welcome-intro * { animation-play-state: paused !important; }';
      document.head.appendChild(style);
    });
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}

test('home greeting uses the brand, reveals letters in order, and leaves the catalog ready', async ({ page }, testInfo) => {
  await holdGreeting(page);
  await page.goto('/');
  const intro = page.getByTestId('welcome-intro');
  const name = intro.locator('.welcome-intro__name');
  const mark = intro.locator('svg');
  await expect(intro).toBeVisible();
  await expect(name).toHaveText('Gói Ấm Trao Em');
  await expect(intro).toHaveCSS('background-color', 'rgb(248, 243, 231)');
  await expect(mark).toHaveCSS('color', 'rgb(40, 75, 55)');

  const seekAnimations = (time: number) => intro.evaluate((element, currentTime) => {
    element.getAnimations({ subtree: true }).forEach(animation => {
      animation.pause();
      animation.currentTime = currentTime;
    });
  }, time);
  await seekAnimations(0);
  await expect(name.locator('span').first()).toHaveCSS('opacity', '0');
  await seekAnimations(1100);
  await expect(name.locator('span').first()).toHaveCSS('opacity', '1');
  await expect(name.locator('span').last()).toHaveCSS('opacity', '0');
  await seekAnimations(1950);
  await expect(name.locator('span').last()).toHaveCSS('opacity', '1');
  const flowerBox = (await mark.boundingBox())!;
  const nameBox = (await name.boundingBox())!;
  expect(nameBox.y).toBeGreaterThan(flowerBox.y + flowerBox.height);
  expect(nameBox.x).toBeGreaterThanOrEqual(0);
  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('welcome-intro.png') });
  await seekAnimations(2300);
  const fadeOpacity = await intro.evaluate(element => Number(getComputedStyle(element).opacity));
  expect(fadeOpacity).toBeGreaterThan(0);
  expect(fadeOpacity).toBeLessThan(1);
  await seekAnimations(2500);
  await expect(intro).toBeHidden();
  // The fallback also removes the overlay when CSS animations cannot complete.
  await page.clock.runFor(2600);
  await expect(intro).toHaveCount(0);
  await page.clock.resume();
  await expect(page.getByRole('link', { name: 'Bánh thử', exact: true })).toBeVisible();
});

test('keyboard interaction dismisses the greeting and preserves navigation focus', async ({ page }) => {
  await holdGreeting(page);
  await page.goto('/');
  const intro = page.getByTestId('welcome-intro');
  await expect(intro).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(intro).toHaveCount(0);
  // Safari can start tab navigation at buttons unless link tabbing is enabled.
  expect(['A', 'BUTTON']).toContain(await page.evaluate(() => document.activeElement?.tagName));
  await expect(page.locator(':focus')).toBeVisible();
});

test('a pointer interaction dismisses the greeting and navigation home does not replay it', async ({ page }) => {
  await holdGreeting(page);
  await page.goto('/');
  await page.clock.runFor(100);
  await expect(page.getByTestId('welcome-intro')).toBeVisible();
  await page.getByRole('link', { name: /^Giỏ hàng,/ }).click({ force: true });
  await page.clock.resume();
  await expect(page.getByTestId('welcome-intro')).toHaveCount(0);
  await expect(page).toHaveURL('/cart');
  await expect(page.getByRole('heading', { name: 'Giỏ hàng', exact: true })).toBeVisible();
  await page.locator('.navbar-brand').first().click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('welcome-intro')).toHaveCount(0);
});

test('reduced motion skips the greeting and dismisses it when the preference changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const intro = page.getByTestId('welcome-intro');
  await expect(intro).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Bánh thử', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(intro).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(intro).toHaveCount(0);
});

test('direct product entry opens immediately without a greeting', async ({ page }) => {
  await page.goto('/products/banh-thu');
  await expect(page.getByTestId('welcome-intro')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bánh thử', exact: true })).toBeVisible();
});
