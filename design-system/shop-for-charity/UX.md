# UX — Gói Ấm Cho Em

The shop keeps the warm workshop identity and short copy. Changes focus on predictable actions and recovery rather than adding promotional sections.

## Customer journey

- Browse: search with a clear action, result count, reset filters, and stable results while the next request loads.
- Product and combo: visible price and stock, a consistent quantity control, a reliable link back to the catalog, and feedback with a direct cart link. Mobile purchase controls remain in normal flow so they cannot cover the price or description.
- Cart: product links, clear item quantities and totals, explicit remove controls, and a 15-second undo window for removal or clearing. Reducing quantity stops at one. Product and combo identity is preserved even when their catalog IDs match.
- Checkout: a three-step progress indicator; no account requirement; autofill; a single pickup point selected automatically; optional fields collapsed; field errors and focus on the first invalid field. Quote refresh keeps the form mounted and preserves user edits. Failed, expired, unavailable, or pending quotes cannot be submitted. A successful order cannot be redirected back to an empty cart while the success page loads.
- Confirmation: explain the next action; save guest credentials by copying or downloading; provide a clipboard-error fallback. The tracking link carries credentials in navigation state instead of a URL and prefills lookup. Account orders link to their account detail page.
- Orders: customer and seller order lists become readable cards on phones. Order progress is explicit and uses text as well as color. Payment and cancellation errors remain recoverable.
- Account: password visibility controls, input autofill, consistent account navigation, and success feedback that stays long enough to read.

## Management and shared behavior

Seller product, combo, order, and log tables adapt to phone layouts. Filters have accessible names. Errors no longer open browser alerts; pending actions are disabled, asynchronous failures preserve the current editor or modal, and list mutations have visible error feedback.

Mobile navigation exposes catalog, cart, orders, and account. Controls use at least 44px targets where appropriate; form inputs use 16px text. The existing reduced-motion behavior is retained. Pages load their code on demand, with a loading state and a recoverable page error boundary.

Guidance comes from the project's UI UX Pro Max skill and its local accessibility, touch, form, navigation, and performance references. Changes retain the existing React stack and backend contracts.

## Verification — 2026-10-09

- Production build and lint complete. Lint still reports React Fast Refresh and existing state-in-effect warnings.
- All 26 routes checked at 375, 768, 1024, and 1440px: no viewport overflow or browser runtime errors in the final route pass.
- WCAG A/AA automated checks cover 14 key routes on mobile and desktop. A low-contrast placeholder and a mobile cart total overflow found during review were corrected.
- Interaction checks cover adding an item, quantity boundaries, removal and clear-cart undo, single pickup selection, optional fields, validation focus, password visibility, payment changes, quote refresh without input loss, expired quotes, stock loss, and failed quote requests.
- An isolated guest journey covers checkout through confirmation and tracking, including download and clipboard failure. Browser-only fixtures are used; these checks create no real orders or accounts in Supabase.

These checks verify the implementation. Ease of use with actual students and sellers still needs observation of real users performing their tasks.
