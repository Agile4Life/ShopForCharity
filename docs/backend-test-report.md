# Backend validation — 09/10/2026

Commands use Java 25.0.4, Maven 3.9.11 with Java 21 release target, Spring Boot 3.5.7.

- Maven `verify`, backend build and JAR packaging: pass. 35 unit/security/contract tests passed; 9 PostgreSQL tests skipped because Docker is unavailable.
- Unit/security/contract checks: cover signed JWT issuer/audience/expiry/signature, metadata role escalation, disabled profiles, order ownership and scoped guest cookies, CSRF origin checks, guest/idempotency encryption and replay, aggregate product+combo demand, image MIME/decoding/thumbnail, order/payment state conditions, partial/late/extra receipts, and controller route coverage in OpenAPI. See Maven surefire reports for actual counts.
- OpenAPI exporter: 58 controller operations, 51 schema definitions, internal refs checked. JSON syntax is valid YAML; no YAML library is required.
- PostgreSQL integration suite: 9 tests compiled, **not run** (Docker engine unavailable). Includes last-item concurrent checkout, guest credential replay, stale quote, cancel/expiry replay, workflow/payment prerequisites, early payment+refund, duplicate bank references and audit rollback. Until run on disposable PostgreSQL, migration, locking and transaction behavior remain unverified in this environment.
- Supabase Auth/Storage and FE→BE→DB smoke tests: **pending owner provisioning**. No service keys, bank credentials or production data were fabricated.
- FE commits reviewed: `2b121b7`, `5a42df5`, `c38b2fc`; compatibility notes in `backend-integration-notes.md`. No frontend source edited by backend work.
- Load targets/p95 latency, live QR content, backups, least-privilege grants on a real Supabase instance and production TLS/cookie policy: not measured/verified yet.

Run `backend/mvnw.cmd verify` with Docker running before accepting DB concurrency/migration requirements. Then configure dev Supabase and smoke test: upload+publish product → guest CASH quote/order → seller contact SUCCESS → accept → prepare → ready → record real demo receipt → complete → verify stock, history and audit; repeat BANK_TRANSFER report/confirm and cancel/refund. Use only demo receipts; tests do not move money.
