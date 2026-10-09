# Gói Ấm Cho Em

## Direction

Playful school-market storefront: warm paper, forest ink, terracotta, pink stationery, and small original cut-paper illustrations. The visible identity is **Gói Ấm Cho Em**, used consistently in the navigation, homepage, account illustration, footer, and browser metadata. Copy names the products, actions, and pickup steps directly. No repeated slogans, decorative English captions, or long welcome paragraphs.

Guidance: [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), read from its `SKILL.md` and local design-system/style/React searches. The initial high-variance recommendation leaned toward brutalism; the organic-style search and the user's workshop brief informed the final softer paper treatment. Existing React, Vite, React Query, Supabase, and native CSS architecture are retained.

## Tokens

| Purpose       | Value            |
| ------------- | ---------------- |
| Primary ink   | `#284B37`        |
| Page paper    | `#F8F3E7`        |
| Receipt paper | `#FFF8E8`        |
| Terracotta    | `#B4482D`        |
| Sage          | `#DEE8C8`        |
| Pink          | `#F4AFC1`        |
| Yellow        | `#F5D17B`        |
| Muted text    | `#626A59`        |
| Display font  | Baloo 2 Variable |
| Body font     | Be Vietnam Pro   |

Fonts are self-hosted npm assets with Vietnamese support. Source tokens and responsive rules live in `frontend/src/workshop.css`. Existing component styles load first; workshop styles implement the shared visual system across customer and seller routes.

## Composition

- Storefront: two-line brand heading, workshop illustration, two lines of useful context, real shop status, category controls and search, product grid, compact combo section, and a three-step pickup guide. Empty combo state stays small. No announcement ribbon or repeated promotional captions.
- Product cards: image-led open layouts, clear stock/price, one labeled add action. No fabricated products, statistics, testimonials, charitable impact, or product photographs.
- Account: illustrated brand panel beside a paper form; phones show the form directly without repeating the brand panel.
- Cart and checkout: readable item rows and paper receipt summary; summaries become normal flow on mobile.
- Seller: horizontal workbench navigation, grouped metrics, legible tables, consistent editors, and quieter motion. Tables scroll within their own container.
- Empty/loading/error states receive the same visual treatment. Unknown URLs render a branded 404 with a working return link.

## Motion and accessibility

- Native CSS for page entrance, short staggered scroll reveals, finite paper sway, button feedback, image hover, cart-count feedback, modal/drawer entrance, and loading indicators.
- Animate transforms and opacity; avoid scroll hijacking, pinned content, and decorative perpetual motion.
- Honor `prefers-reduced-motion`: show all content immediately and remove animation/transitions.
- Visible focus indicators, a skip link, labeled form controls, expanded menu state, modal focus trapping/restoration, Escape dismissal, and disabled semantics.
- Search is debounced. Cart-limit feedback appears inline as a toast on the storefront.

## Verification — 2026-10-09

Production build passes. Lint completes with existing React warnings. Browser checks cover 26 routes at 375, 768, 1024, and 1440px using isolated API/session fixtures; no fixtures are persisted to Supabase. No viewport horizontal overflow was found. The missing main heading in customer order detail and missing seller form labels were corrected during review.

Accessibility audits cover storefront, login, checkout, seller dashboard/settings/product editor/combo editor/order detail, account profile/order detail, and guest lookup. Audit issues were corrected and affected pages rechecked. Interactive checks cover mobile menu, product add/cart persistence, quantity update, checkout inline validation, modal keyboard focus/Escape, and reduced motion.

Real Supabase catalog remains empty and closed for orders, so populated product/order/seller layouts were verified with browser-only fixtures. Real purchases, seller mutations, and user registration were not submitted as part of the redesign checks.
