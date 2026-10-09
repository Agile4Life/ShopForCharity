# Test và chuẩn bị deploy — 09/10/2026

Backend hiện vẫn là Java/Spring Boot, giữ JUnit. Chưa deploy hoặc chuyển sang Node.js. Cấu hình Vercel hiện chuyển tiếp API đến backend HTTPS riêng. Yêu cầu giữ Java, không dùng container và đặt toàn bộ backend/frontend trên Vercel còn vướng runtime; không đánh dấu production ready khi chưa giải quyết điều này.

## Chạy kiểm tra

```powershell
cd frontend
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run check
cd ../backend
.\mvnw.cmd -B -ntp test
.\mvnw.cmd -B -ntp verify
```

`check` chạy lint, typecheck test rồi Playwright; Playwright tự build production frontend và chạy Vite preview trên port 4173 với config giả lập an toàn. Không dùng server đang chạy sẵn. Test không cần secrets, không gửi email hay thao tác ngân hàng/DB thật. Browser được cài vào cache mặc định; nếu cài vào `frontend/.browsers`, đặt `PLAYWRIGHT_BROWSERS_PATH` trỏ tới thư mục đó khi chạy.

Từ repo root có thể chạy `./scripts/predeploy.ps1`. `-UnitOnly` bỏ integration và không đủ để xác nhận release. PostgreSQL integration dùng DB disposable qua Testcontainers; Docker chỉ cần cho kiểm thử DB, không cần cho deploy JAR. `verify` sẽ fail nếu thiếu Docker. CI `.github/workflows/predeploy.yml` chạy hai job frontend/backend và lưu HTML, trace/screenshot khi lỗi, cùng JUnit XML. Cần cấu hình quy trình release chờ cả hai job pass; Vercel auto-deploy không tự chờ các job GitHub này.

## Flow coverage

| Flow | Playwright | JUnit / PostgreSQL |
| --- | --- | --- |
| Catalog | tìm kiếm, danh mục, sắp xếp, detail product/combo, hết hàng | public catalog và contract routes |
| Cart | thêm product/combo, lưu khi refresh, xóa/hoàn tác, đổi số lượng và giới hạn 20 | aggregate demand product + combo |
| Checkout | guest CASH/BANK_TRANSFER, account prefill, validation, empty cart, shop đóng, quote hết hạn/hết hàng, session fail, conflict giữ giỏ, token không lưu localStorage/URL | quote đổi giá, reserve, last-item concurrency, credential/idempotent replay, audit rollback |
| Auth | login success/error, register metadata, forgot/reset password, callback có/không session, profile whitelist/version, logout, route guards | JWT signature/issuer/audience/expiry, profile role/active, Origin checks |
| Buyer orders | account list/detail, guest lookup/error, cancel, báo chuyển khoản chỉ REPORTED | ownership/scoped guest access, token sai/hết hạn, customer order không dùng guest token |
| Seller orders | contact → accept → prepare → ready → paid → complete; reject/cancel; dismiss report; refund partial/extra receipts đúng thực nhận | transition/payment prerequisites, late/partial/extra receipts, duplicate bank reference, refund, cancel/expiry stock settlement |
| Seller catalog | upload ảnh product, create/edit product/combo, archive/reactivate, inventory version khi điều chỉnh tồn | image validation/thumbnail; reserve/settle exactly once, UUID lock ordering |
| Seller administration | dashboard, đọc thông báo/mở đơn liên quan, order/audit filters, shop settings, upload QR/lưu ngân hàng/đóng nhận đơn, tạo/bật/tắt điểm nhận với version | contract coverage; PostgreSQL fixtures tạo pickup và catalog |
| Navigation | direct routes trên production preview, unknown route 404 | Vercel rewrite/env validation |

Browser test **mock API/Supabase tại network boundary** và kiểm tra request payload, idempotency key, bearer header, version, UI state. Đây không phải bằng chứng FE→BE→Supabase thật hoạt động. Mock không thay thế test domain/database. Không tuyên bố exhaustive coverage cho mọi tổ hợp status, mọi lỗi mạng hay mọi file upload.

## Kết quả và việc còn lại

- JUnit: 48 test pass, 0 failure/error/skip (35 hiện có + 13 guest access/inventory mới).
- Java JAR packaging: pass, tạo `backend/target/backend-0.1.0.jar`; chưa chạy service với Supabase thật.
- Vercel config: 4 test pass.
- Frontend lint: pass với 10 warning hiện có; frontend/test typecheck và production build pass.
- Playwright: 86 test pass, 0 failure/skip; 43 scenario trên desktop/mobile Chromium, production build tự chạy trước suite. HTML: `frontend/playwright-report/index.html`; JUnit XML: `frontend/test-results/playwright.xml`.
- PostgreSQL integration: chưa pass tại máy này vì Docker engine chưa hoạt động. CI đã cấu hình nhưng chưa chạy trên GitHub.
- Chưa kiểm chứng live Supabase Auth redirect/JWKS, quyền runtime/migration, bucket upload/private QR, API HTTPS/readiness, cookie qua proxy Vercel, backup/restore hoặc tải thực tế.

Trước production, chạy cả CI và smoke trên staging dùng Supabase dev: upload/publish → guest và account checkout → contact/accept/payment/complete → kiểm tra stock/history/audit, cancel/refund, logout/reset. QR/bank chỉ dùng dữ liệu demo cho test; không đánh dấu mock là giao dịch ngân hàng thật. Làm theo [hướng dẫn deploy](./vercel-deployment.md) để đặt env và chạy Java JAR nếu chọn backend host riêng.

## Những lỗi đã sửa qua test

1. Checkout không bỏ qua lỗi tạo guest session; lỗi session chặn quote và submit.
2. Refund gửi `receivedAmount` thay vì `total`, bao gồm trường hợp nhận thiếu/thừa.
3. Bật/tắt pickup point gửi `expectedVersion` của point.
4. Logout rời protected route trước SIGNED_OUT để tránh redirect race về login khi mục tiêu là trang chủ.
