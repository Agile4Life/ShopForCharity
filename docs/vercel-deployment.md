# Deploy Node.js và React/Vite lên Vercel

Runtime: Node.js 24. Entry serverless: `api/index.js`; `backend/src/server.js` chỉ dùng khi chạy server thông thường.

## Monorepo: một Vercel project

Import repo, Root Directory là root, Framework Preset Vite. `vercel.mjs` cài dependency cả frontend/backend bằng lockfile, build frontend, route `/api/*` và `/actuator/*` tới backend và đóng gói CA certificate.

Đặt biến môi trường theo từng Preview/Production:

| Biến | Giá trị |
| --- | --- |
| SERVERLESS_BACKEND | true |
| VITE_API_BASE_URL | /api/v1 |
| VITE_SUPABASE_URL | HTTPS origin project Supabase |
| VITE_SUPABASE_PUBLISHABLE_KEY | Publishable/anon key; không dùng service key |
| DATABASE_URL | PostgreSQL runtime URL; dùng transaction pooler cho serverless |
| DB_SSL_CA | CA PEM override, newline thật hoặc escaped \n |
| DB_POOL_MAX | 3 mặc định mỗi instance |
| GUEST_SESSION_SIGNING_KEY | Base64 của 32 byte ngẫu nhiên |
| IDEMPOTENCY_ENCRYPTION_KEY | Base64 của 32 byte ngẫu nhiên khác signing key |
| CRON_SECRET | Secret ngẫu nhiên riêng |
| SUPABASE_URL | HTTPS origin project Supabase |
| SUPABASE_BACKEND_SECRET_KEY | Credential backend dùng Storage |
| JWT_ISSUER_URI | https://<project>.supabase.co/auth/v1 |
| JWT_JWK_SET_URI | https://<project>.supabase.co/auth/v1/.well-known/jwks.json |
| JWT_EXPECTED_AUDIENCE | authenticated, khớp Auth |
| APP_SHOP_ID | UUID tồn tại; seed: 00000000-0000-0000-0000-000000000001 |
| PUBLIC_PRODUCT_BUCKET | product-images hoặc bucket public thật |
| PRIVATE_PAYMENT_BUCKET | payment-qr hoặc bucket private thật |
| CORS_ALLOWED_ORIGINS | Chính xác HTTPS origin frontend; phân cách dấu phẩy |
| COOKIE_SECURE | true |
| MIGRATIONS_ENABLED | false trên Vercel |

Không đưa secret vào VITE_*. Trên Vercel app không đọc .env. Cấu hình Auth redirect URL và deny browser upload vào các bucket.

## TLS

CA người dùng tải từ Supabase Dashboard nằm trong `backend/certs/supabase-ca.crt`; endpoint Supabase tự dùng file này nếu không có override. Khi rotate CA, cập nhật file hoặc đặt DB_SSL_CA mới. Local có thể dùng DB_SSL_CA_PATH. Backend giữ xác minh certificate; URL sslmode không được ghi đè CA.

[Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Migration

Dùng MIGRATION_DATABASE_URL hoặc MIGRATION_DB_URL cùng MIGRATION_DB_USERNAME/PASSWORD cho owner credential riêng. MIGRATION_DB_SSL_CA/PATH override CA runtime. Không dùng runtime account cho DDL.

DB mới: `npm.cmd --prefix backend run migrate`. Runner tạo schema trước history, dùng transaction/advisory lock và SHA-256 checksum.

DB Java/Flyway hiện có: `npm.cmd --prefix backend run migrate:upgrade-node`. Script kiểm tra CRC32 theo [thuật toán Flyway](https://github.com/flyway/flyway/blob/main/flyway-core/src/main/java/org/flywaydb/core/internal/resolver/ChecksumCalculator.java), baseline migration đã khớp, thêm V4 và cấp quyền trên bảng rate limit cho runtime role. Không chạy lại V1–V3. Migration lạ/failed/checksum sai sẽ dừng. Chỉ chạy trên DB đã được phép nâng cấp.

Node history cũ thiếu checksum cần đối chiếu riêng; không tự gán checksum chưa xác minh. Provision shop_runtime và chạy `backend/deployment/runtime-grants.sql` bằng owner sau migrations cho DB mới. Runtime không được sửa history hay UPDATE/DELETE audit/payment append-only. Không expose schema shop qua Data API. Seed đóng nhận đơn; chỉ mở sau khi có dữ liệu/config thật.

## Cron

GET có `Authorization: Bearer <CRON_SECRET>`:
- /api/v1/cron/expire: trả stock cho pending unpaid orders hết TTL, mặc định 24h.
- /api/v1/cron/cleanup: dọn asset, idempotency và rate-limit records cũ.

Vercel gửi Bearer khi CRON_SECRET đã được cấu hình. Token sai trả 401; thiếu secret trả 503; không gọi DB.

Daily mặc định cho Hobby: expire 00:00 UTC (07:00 Việt Nam), cleanup 01:00 UTC (08:00 Việt Nam). Trả stock có thể chậm thêm gần một ngày cộng độ trễ lịch nền tảng. Với gói hỗ trợ lịch thường xuyên, đặt VERCEL_CRON_FREQUENT=true: expire mỗi phút, cleanup mỗi giờ. Hoặc scheduler ngoài gọi GET cùng secret.

[Cron và giới hạn gói](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Cron tự chạy trên production; preview cần request thủ công.

## Hai project riêng

Backend: Root Directory backend, Framework Other, dùng backend/vercel.json. Đặt biến backend, CRON_SECRET và CA; lịch mặc định daily, sửa theo gói nếu cần.

Frontend: Root Directory root, SERVERLESS_BACKEND=false, BACKEND_ORIGIN=https://<backend>.vercel.app. FE vẫn gọi /api/v1 qua proxy cùng origin cho guest cookie. Backend CORS allowlist dùng origin frontend.

## Verification

Upload FE/BE tối đa 4 MiB, multipart fields bị giới hạn để chừa khoảng trống dưới [Vercel payload cap 4.5 MB](https://vercel.com/docs/functions/limitations).

Chạy `npm.cmd test` và `npm.cmd --prefix frontend run build`. Tests dùng fixture/DB embedded, không đọc .env hay dùng DB shop. Embedded không thay thế TLS/Auth/Storage/network hoặc concurrency nhiều connection thật.

Sau khi link Vercel project: vercel pull --environment=preview, vercel build rồi tạo preview. Smoke test health, guest cookies, Auth/seller authorization, quote/order/stock/payment và upload. Chỉ chạy cron hợp lệ trên DB test khi kiểm tra.
