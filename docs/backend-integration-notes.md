# Backend integration status for FE agent

Backend owns `/api/v1`, frontend files are untouched. Checked FE commit `2b121b7`.

## Required FE contract updates (keep the spec's safety rules)

1. `GET /combos`, `/seller/combos`, `/seller/notifications` return `PageResponse<T>` (use `.content`). All lists are bounded/paginated, default size 20, max 100.
2. Send `{expectedVersion}` for activate/archive, contact-attempt, customer/guest cancel and payment-report; send `{expectedVersion,reason}` for cancellation. Get current version from detail. Missing versions are validation errors. Contact mutates order version; reload order before accepting.
3. Refund confirmation must send `{expectedVersion,amount,bankReference?,note?}` with amount equal to `receivedAmount` returned to seller. Confirmed pickup requires BOTH point ID and a future timestamp.
4. Keep the SAME random UUID `Idempotency-Key` when retrying a timed-out operation. Generate a new key only for a new operation or a changed payload. Current `apiFetch` regenerates keys unless supplied explicitly.
5. Account profile PATCH whitelist: `{fullName?,phone?,expectedVersion}`. Email identity remains managed by Supabase Auth; do not PATCH email/role here.
6. Inventory version is separate: read `inventoryVersion` from seller product detail; stock adjustment uses it, rather than product `version`.
7. Quote input accepts `{items,paymentMethod?}`. Prefer supplying the selected payment method. A 409 `CHECKOUT_CHANGED` includes a new quote in `details.quote`; show prices and require confirmation. Catalog unavailable can require reloading cart before quote.
8. Guest checkout requires `POST /checkout/session` first; preserve its cookie for retries. Guest access uses `POST {orderCode,guestToken}` then the scoped cookie. Never put token in URL or localStorage.
9. Proxy must preserve browser Origin (`http://localhost:5173`) for guest writes. API accepts only configured Origins on cookie mutations. Production defaults to Secure cookies; local HTTP sets `COOKIE_SECURE=false`.

## Backend compatibility work

Backend will expose FE field names (`imageUrl`, `isSoldOut`, `categoryName`, `preservationInstructions`, `productName`, `totalPages`) and accept generated slugs for create forms. It accepts UUID or slug on public detail routes. Catalog/settings PATCH supports partial fields with explicit expectedVersion. Stock adjustment accepts `deltaOnHand` and optional absolute `stockOnHand` (exactly one).

Database and Supabase credentials are intentionally pending owner provisioning. Build/unit checks can run without them. PostgreSQL integration checks run with Docker or an explicitly disposable test DB (never production). See backend README and OpenAPI.
