# Hover validation — 2026-10-10

Hover previously changed disabled primary/secondary/danger button colors, lifted product/combo cards and primary buttons out of their original hit areas, and rotated the entire compact add-to-cart button, including its loading/success icon.

All 37 hover rules in the four shared stylesheets now require `(hover: hover) and (pointer: fine)`. Disabled buttons and payment options do not receive enabled hover feedback. Cards/buttons keep their hit areas fixed; mouse users still receive color/shadow feedback and a 200ms image zoom clipped inside the image frame. Image, brand-icon, arrow and illustration motion also require `prefers-reduced-motion: no-preference`. Active navigation, selected options, open account menus and keyboard focus retain their independent styles.

## Validation

- Before the fix, Playwright reproduced both the disabled-button color change and rotated cart-button failures.
- Final Chromium desktop/Pixel 7 run: **150/150 passed**, 4.2 minutes, 0 failures/errors/skips. This includes **56 hover tests** (23 public/customer/seller routes per device plus five focused cases) and **94 regression tests** for catalog, cart feedback, checkout/payment, menus, scroll motion, pickup scheduling and seller actions.
- Firefox/WebKit focused hover checks: **10/10 passed**, 35.4 seconds, 0 failures/errors/skips. Covered lower-edge hit testing, nine disabled button variants, pending/success cart states, keyboard focus, reduced motion and actual image zoom.
- Production build, application/E2E TypeScript and `git diff --check` passed. Lint has 0 errors and 11 existing React/Fast Refresh warnings.
- The preceding responsive validation covered 12 viewport sizes and passed 286 Chromium checks; see [responsive-validation.md](responsive-validation.md).

Page audits compare bounds in document coordinates so Playwright's automatic scrolling does not masquerade as hover displacement. Focused lower-edge tests compare viewport coordinates while leaving the pointer stationary. These are local browser/viewport tests with isolated API fixtures, not a production database test or physical-device certification.

Logs: `.tools/hover-final-validation.log`, `.tools/hover-cross-browser.log`. HTML reports: `frontend/playwright-report/index.html`, `frontend/playwright-report/responsive-cross-browser/index.html`. Test artifacts and logs remain ignored by Git.

## Reproduction

From `frontend`, with installed Playwright browsers:

```powershell
node node_modules/@playwright/test/cli.js test e2e/hover.spec.ts e2e/cart-feedback.spec.ts e2e/catalog-checkout.spec.ts e2e/controls.spec.ts e2e/scroll-motion.spec.ts e2e/pickup-schedule.spec.ts e2e/seller.spec.ts --workers=2
node node_modules/@playwright/test/cli.js test e2e/hover.spec.ts --config=playwright.responsive.config.ts --grep 'stable hit|disabled buttons|cart loading|touch and|image zoom' --workers=2
```

Run sequentially, or set `E2E_REUSE_BUILD=1` for the second command only after the primary build finishes, to avoid rebuilding the shared `dist` during active browser navigation.
