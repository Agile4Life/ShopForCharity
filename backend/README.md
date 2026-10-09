# School Shop backend Node.js

Runtime: Node.js 24, Express, PostgreSQL, Supabase Auth/Storage. See [Vercel deployment](../docs/vercel-deployment.md) and [test readiness](../docs/node-vercel-readiness.md).

```powershell
npm.cmd ci --workspaces=false
npm.cmd test
npm.cmd run dev
```

Copy .env.example to .env for local development. Vercel uses Environment Variables. Tests use fixture keys and an isolated embedded PostgreSQL database.

Run migrations separately with MIGRATION_DATABASE_URL or MIGRATION_DB_URL and owner credentials. Runtime credentials are separate. Keep MIGRATIONS_ENABLED=false on Vercel. Existing Flyway databases can use the explicit migrate:upgrade-node command after checksum verification and approval to change the database.

## Legacy Java backend

The Java files and instructions below are retained for the Spring Boot version; they are not Node startup instructions.

For Vercel frontend deployment with a separate Java JAR backend, see [deployment guide](../docs/vercel-deployment.md). The Vercel project uses repository-root `vercel.mjs` and same-origin API proxy. See [current test readiness](../docs/predeploy-readiness.md).

Spring Boot 3.5.7 modular monolith: controllers → transactional services → Spring Data JPA/EntityManager repositories. Target Java 21 (build also tested using installed Java 25). PostgreSQL 16+, Supabase Auth and Storage. No secrets are required to run unit tests. Backend can run as a Java JAR without Docker; see the deployment guide.

## Build and test

```powershell
cd backend
.\mvnw.cmd test
.\mvnw.cmd verify
```

Linux/macOS: `sh mvnw test` / `sh mvnw verify`. Maven 3.9.11 wrapper downloads the pinned distribution. Unit tests use no remote credentials. `verify` also runs `BackendPostgresIT` on disposable PostgreSQL 16.4 using Testcontainers; start Docker first or run the CI workflow. Without Docker, `verify` **fails** so missing database validation cannot appear green. Docker is a test dependency only; deploying the Java JAR does not need Docker. Never point this suite at the shop's database.

## Configure and start

Copy `.env.example` to your private environment configuration; Spring does not implicitly read `.env`. Export variables in the terminal or inject via deployment platform. Set Java process environment, then:

```powershell
.\mvnw.cmd spring-boot:run
```

Or build with `verify` and run `java -jar target/backend-0.1.0.jar`. API base: `http://localhost:8080/api/v1`. FE Vite proxy forwards `/api` here. Local browser Origin: `http://localhost:5173`; set `COOKIE_SECURE=false` only for local HTTP. Production must use HTTPS, Secure cookies, exact `CORS_ALLOWED_ORIGINS`, and preferably a same-origin reverse proxy. No wildcard origin. Browser cookie mutations require allowlisted `Origin`; CLI smoke tests must include it too.

Two independent secrets are required: `IDEMPOTENCY_ENCRYPTION_KEY` and `GUEST_SESSION_SIGNING_KEY`, each standard base64 for 32 random bytes. Generate with a CSPRNG locally and put in your secret store. Do not use the same key or log values. Key rotation must preserve old decrypt/session verification keys during retention or explicitly invalidate old sessions/idempotency records. Current implementation supports one active key each; schedule rotation during a maintenance window after the 48h replay window.

Auth config: project issuer `/auth/v1`, JWKS `/auth/v1/.well-known/jwks.json`, audience `authenticated` (match actual project configuration), asymmetric RS256 or ES256 signing. Backend validates signature, issuer, audience and lifetime, then reads business role and active state from DB. Supabase registration/login/reset/verification stay in FE Supabase SDK. Backend stores no passwords.

## Supabase setup and migrations

1. Create separate dev and production projects. Choose direct JDBC or session pooler for a long-lived JVM; use dashboard connection details and `sslmode=require` remotely.
2. Provision a LOGIN migration role with rights to create/own `shop`, and a separate LOGIN `shop_runtime` with a secret password and no superuser/DDL rights. Do not make runtime a member of migration/owner roles. If you pick different names, adapt `deployment/runtime-grants.sql` outside application requests.
3. Run Flyway with `MIGRATIONS_ENABLED=true` and the `MIGRATION_DB_*` owner credential in a controlled migration job. Keep runtime `DB_*` separate. `V1` creates tables, `V2` constraints/indexes/private-schema grants and seeds the default shop/categories, `V3` allergens. Each migration runs once; Flyway validates checksums on subsequent starts. Afterward set `MIGRATIONS_ENABLED=false` for normal JVM runtime.
4. Run `deployment/runtime-grants.sql` as owner after migration. Runtime gets DML on business tables; append-only audit/payment/history/movement/contact/bank-version tables allow SELECT/INSERT only. No Flyway table or schema CREATE rights. Schema `shop` must stay outside the Supabase Data API exposed schema list; migrations revoke `PUBLIC`, `anon`, `authenticated` privileges.
5. Create Storage buckets `product-images` (public read) and `payment-qr` (private). Deny browser uploads to both. Backend uses a server-only Supabase secret/service credential via `apikey` and Authorization. Configure actual bucket names via env. Product URLs are public; QR URLs are signed for 300 seconds only after checking order ownership or seller authorization.
6. Register your intended seller through Supabase Auth, verify email, then call `/me` to create the CUSTOMER profile. As schema owner, promote that **specific verified auth_user_id** outside the API: `UPDATE shop.profiles SET role='SELLER' WHERE auth_user_id = '<verified UUID>';`. Never promote by unverified user metadata. Verify exactly one expected row changed. There is no default seller credential or public seller registration.
7. Default shop UUID is `00000000-0000-0000-0000-000000000001`; `APP_SHOP_ID` must match an existing shop. Seed starts with `acceptingOrders=false`, categories SNACK/SOUVENIR, no products, bank, QR, pickup or seller data. Seller creates active pickup, uploads real image/QR, creates/publishes products/combo, configures bank and opens orders. No fabricated production values.

Verify runtime cannot CREATE TABLE or UPDATE/DELETE audit; verify `anon`/`authenticated` cannot read schema `shop`. Before opening sales, run migrations on an empty disposable DB and again on the migrated DB, run the PostgreSQL suite, and smoke test using dev Supabase Auth/Storage.

## Contract and workflows

See [OpenAPI](../docs/openapi.yaml), [integration notes](../docs/backend-integration-notes.md), [decisions](../docs/decisions.md), and [spec](../docs/spec.md). Lists return bounded `content` pages except categories and pickup points. Public detail accepts UUID or slug. Catalog/settings PATCH accepts partial fields; explicit null does not clear fields, use an empty string to clear optional text. Stock is changed through its dedicated endpoint, using `inventoryVersion` from seller detail.

- All mutations touching money, stock, order status/contact take a random UUID `Idempotency-Key` and current `expectedVersion`. Retry the same request/key after timeout; a different body with the same key returns 409. Results, including guest credentials, are AES-GCM encrypted for 48 hours and stored atomically with changes.
- Guest first gets `/checkout/session`, submits a quote and order with cookies. Creation returns `guestAccessToken` once and on authorized idempotent replay; guest stores it deliberately, never in a URL/log/localStorage. `/guest/orders/access` exchanges code+token for a signed cookie scoped to one order. Token expires after 90d; cookie after 7d. Guest has no account history.
- Quote expires in 5m, fingerprints canonical cart/catalog/payment config, and never reserves stock. Submit checks quote and locks inventory, aggregates product/combo demand, snapshots catalog and bank version, reserves stock, logs audit, notifies each active seller and stores replay result in one transaction.
- Every business write takes configured shop row lock first. Order/catalog data follow, then inventory UUID order. This coarse lock serializes writes and scheduler across JVM replicas, preventing mixed catalog snapshots; reads can run concurrently. DB lock/dependency failures return safe errors, and retries keep the key. Load goals remain unmeasured.
- Contact SUCCESS and confirmed future pickup are required before ACCEPTED. Completion requires READY+PAID. Terminal release/consume operates only HELD reservations. Pending unpaid orders expire after 24h; REPORTED/PAID require manual review. Scheduler runs each minute and rechecks while locked.
- Buyer reporting transfer only sets REPORTED. Seller records actual received money and bank reference; exact cumulative total sets PAID, partial/extra receipts stay in manual reconciliation. Each event carries the received delta; duplicate bank reference is rejected. If a paid or partially received order is cancelled, REFUND_PENDING is created; cancelled unpaid/reported orders with later money also enter REFUND_PENDING. Refund action requires amount equal to actual `receivedAmount` and a distinct refund reference. No bank transfer happens through this API.
- Audit is append-only and transaction-critical. Audit values contain only safe enums, totals/counts; freeform reasons/contact/payment notes remain in restricted business tables. Public API never returns buyer data or internal reserved stock. Order/list responses use no-store.
- Upload accepts JPEG/PNG/WebP ≤5MB, decodes and verifies format, checks dimensions ≤8192 and ≤20M pixels, strips metadata by PNG encoding, generates 1600px product image and 400px thumbnail. QR preserves pixels. Cleanup deletes unreferenced assets after 24h, retaining order and bank-version references. DB rollback compensates uploads; orphan compensation failure is logged by asset ID for manual cleanup.

## Operations and remaining environment verification

`/actuator/health/liveness` is process health; `/actuator/health/readiness` includes DB. Health exposes no secret/details. Request log contains generated request ID, route template, status and duration, never body/contact/token. Default per-instance limits: create 5/min/caller, guest access 10/min/IP, upload 20/min/seller. If deployed across multiple replicas, configure equivalent shared limits at the reverse proxy; do not trust arbitrary forwarded IP headers.

Before production: validate Supabase Storage credential/bucket policy, Auth redirects/issuer/key, runtime SQL privileges, real QR contents manually, same-origin cookie/CORS behavior, backups/restore, TLS and retention. Metrics are Spring Actuator/Micrometer defaults (HTTP and Hikari); alerting and measured load require deployment infrastructure. No performance or live bank verification has been claimed.

Runbook: close sales via shop settings; investigate pending money before cancellation; confirm actual refunds; inspect audit by order ID; retain old QR objects for old orders. Restore DB+Storage from matching backups and smoke test consistency. Rollback application artifact only after checking schema compatibility; never drop historical order/payment tables to roll back code.
