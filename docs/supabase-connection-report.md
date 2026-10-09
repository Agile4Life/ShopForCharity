# Supabase connection verification

Verified on 2026-10-09 (Asia/Saigon) against the configured Supabase project.

- PostgreSQL Session pooler: JDBC authentication succeeds with `shop_runtime`.
- Flyway V1–V3 applied successfully; 21 business tables exist in `shop`.
- Runtime cannot create objects in `shop`, update/delete audit logs, or read Flyway history. Runtime can insert audit logs. `anon` and `authenticated` have no schema usage.
- Backend starts with migrations disabled and its restricted runtime credentials. `/actuator/health/readiness` returns HTTP 200 with status `UP`.
- `/api/v1/health`, `/shop`, `/categories`, `/products`, and `/combos` return HTTP 200 both directly on port 8080 and through the frontend Vite proxy on port 5173.
- Guest checkout session through the frontend proxy returns HTTP 200 and an HttpOnly cookie.
- Supabase Auth settings and JWKS return HTTP 200. A real user login and authenticated business requests have not been tested.
- `product-images` is public; `payment-qr` is private. Temporary image upload, public product image download, signed QR download, and deletion succeed. Public access to the private QR image is rejected. Temporary images were deleted.
- Frontend production build succeeds. Backend unit tests: 35 passed, zero failures. Docker-based integration tests were not run.

The shop contains the seeded categories, no products or combos, and remains closed for orders. Seller provisioning and shop configuration are still required before taking orders.

Local configuration lives in ignored `backend/.env` and `frontend/.env.local`. To restart the backend in PowerShell, run `./backend/start-local.ps1`. Start the frontend with `npm.cmd run dev` from `frontend/`.

Credentials supplied in chat should be rotated before production use.
