# Backend Node / Vercel readiness

Cập nhật 10/10/2026 (Asia/Saigon).

## Đã hoàn tất

- Cài dependency cả frontend/backend bằng lockfile; clean install và import serverless entrypoint pass.
- Routing health và readiness không lộ chi tiết lỗi.
- Cron GET xác thực CRON_SECRET; token sai không gọi service. Daily mặc định, lịch thường xuyên opt-in.
- TLS dùng CA Supabase người dùng cung cấp, giữ rejectUnauthorized=true.
- Kết nối DB thật với TLS và SELECT chỉ đọc thành công.
- Sau khi người dùng cho phép, đã baseline Flyway V1–V3, chạy V4 trên DB thật và cấp quyền cho PostgreSQL runtime role thực tế (khác username có hậu tố của Supabase pooler).
- Kiểm tra DB thật: runtime có DML trên bảng rate limit, không đọc/ghi migration history; shared rate limit pass với counter test đã rollback; readiness HTTP 200 UP.
- Migration dùng credential riêng, tạo schema trước history, transaction/advisory lock, kiểm tra checksum và baseline Flyway đã xác minh.
- V4 bổ sung shared rate limit PostgreSQL; cleanup dọn counter cũ.
- Upload FE/BE 4 MiB; nâng sharp và Multer.
- Test dùng fixture riêng, không đọc .env hoặc DB shop.
- 39/39 tests pass: 29 backend, 10 deployment/config. Có PostgreSQL embedded migration/rerun/checksum/Flyway baseline/shared counters, native sharp, multipart, export environment và exact origin checks.
- Frontend production build pass. Backend audit: 0 vulnerability được báo cáo.
- Đã chuẩn bị cấu hình goiamchoem.vercel.app và file private .vercel/deploy.env; giữ session/encryption keys, tạo cron secret, không export migration credential.
- Kiểm tra deployment environment: transaction pooler TLS/readiness pass, production/preview origin và cookie Secure/HttpOnly pass; origin khác bị chặn, cron sai token trả 401.
- Clean production install/build và serverless startup pass; backend test dependencies được omit, frontend build dependencies được include. Không tìm thấy giá trị backend secret trong frontend JS bundle.

## Còn cần thực hiện

1. Thiết lập environment variables trên Vercel, link project, chạy Vercel build/preview. Chưa tạo deployment hoặc kiểm tra native sharp trên Linux Vercel.
2. Smoke test Auth/Storage, guest cookies, checkout/stock/payment trên môi trường test thật. Embedded không kiểm chứng network/TLS hay nhiều connection; advisory lock được stub vì PGlite chỉ có một connection.

Xem [hướng dẫn deploy](vercel-deployment.md) và [script nâng cấp](../backend/scripts/upgrade-node-db.js).
