# Backend decisions

- Scope: backend only. Supabase Auth owns registration/password/email verification. No passwords or seller signup in this API.
- Java 21 target, Spring Boot 3.5.7, Maven 3.9.11; PostgreSQL 16+. Dependency versions resolved by the pinned Boot BOM.
- Single configured shop, CUSTOMER/SELLER roles read from DB. Supabase user metadata never grants seller access.
- All business writes acquire a PostgreSQL pessimistic lock on the configured shop first, then order/catalog and inventory (product UUID ascending). This intentionally serializes writes for the initial school pilot and guarantees consistent quotes/catalog snapshots. Reads remain concurrent. Measure pilot load before replacing this with finer locks.
- Guest sessions are HMAC-signed, HttpOnly, Secure by default, SameSite=Lax. Mutating cookie requests require an allowlisted Origin. FE must send Origin and credentials. Bearer-only requests do not use cookies for identity.
- Quote is a signed five-minute fingerprint of canonical cart, catalog versions and payment configuration; stock is rechecked at submit. No reservation on quote.
- Order/action idempotency results use AES-256-GCM, 48-hour retention, caller+route+entity scope, stored atomically with the business change. Guest access token is random 256-bit, stored only as SHA-256 on order.
- Seed only shop and categories, with acceptingOrders=false; no credentials, products, QR or bank values invented. Add a real pickup point and catalog before opening orders.
- Schema `shop` is private to JDBC. Migration and runtime roles are provisioned outside Flyway; deployment SQL grants runtime DML except append-only tables.
- Uploads decode images, limit dimensions, strip metadata by PNG re-encoding; public product images include a thumbnail, private QR is signed on authorized access.
- Public catalog polls at 15s; orders/notifications at 10s; dashboard at 30s (frontend responsibility).
- No external messages, bank automation or frontend implemented in this change.
- Deployment preparation: Vercel hosts the existing frontend from repository root using `vercel.mjs`; `/api` proxies to a configured HTTPS Spring Boot origin. Backend is packaged as a non-root Java 21 Docker service on a separate JVM/container host. Same-origin proxy preserves guest-cookie behavior; no backend secrets are needed in Vercel's frontend build. Deployment accounts, backend origin and Supabase env remain owner-provided.

Official references checked: [Spring JWT](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/resource-server/jwt.html), [Supabase uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Supabase downloads](https://supabase.com/docs/guides/storage/serving/downloads).
