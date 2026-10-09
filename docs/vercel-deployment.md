# Triển khai Vercel + Spring Boot + Supabase

Đã chuẩn bị cấu hình, chưa publish lên tài khoản hay tạo hạ tầng. Mã frontend giữ nguyên.

## Kiến trúc deploy

Vercel build/host FE React/Vite. Request `/api/v1/*` trên domain Vercel được rewrite tới Spring Boot HTTPS. BE chạy dưới dạng JVM/container liên tục và kết nối Supabase PostgreSQL/Auth/Storage. Cookie guest được cấp qua proxy trên domain website, HttpOnly/Secure/SameSite=Lax, path `/api/v1`; tránh gọi API khác site trực tiếp khiến cookie guest không được gửi.

Vercel Functions không có runtime JVM/Spring Boot chính thức; backend hiện có scheduler và connection pool nên cần dịch vụ container/JVM riêng. Có thể dùng hạ tầng container của bạn; chưa chọn hoặc tạo dịch vụ có phí. Tham khảo [Vercel runtimes](https://vercel.com/docs/functions/runtimes), [external rewrites](https://vercel.com/docs/routing/rewrites), [programmatic config](https://vercel.com/docs/project-configuration/vercel-ts).

## 1. Chạy backend trước

Docker build context là `backend/`:

```sh
docker build -t schoolshop-api ./backend
docker run --rm --env-file /secure/path/backend.env -p 8080:8080 schoolshop-api
```

Container chạy Java 21 với user không phải root, không chứa DB/key trong image. `PORT` mặc định 8080, có thể do host cấp. Host phải cung cấp HTTPS public origin, health check `/actuator/health/readiness`, và process không bị dừng giữa các kỳ scheduler. Thiết lập memory ban đầu phù hợp JVM (ví dụ 512MB, đo staging), một replica, pool tối đa 5. Docker build chỉ đóng gói; chạy `backend/mvnw.cmd verify` với Docker hoạt động trước release.

Inject toàn bộ env trong [backend/.env.example](../backend/.env.example) tại host BE. Production: `COOKIE_SECURE=true`, `MIGRATIONS_ENABLED=false`, `CORS_ALLOWED_ORIGINS=https://<domain-website-thật>`. Mỗi origin đầy đủ, phân cách bằng dấu phẩy, không có dấu `/` cuối, không wildcard. BE vẫn kiểm tra Origin gốc từ browser sau Vercel proxy. Không tin X-Forwarded-* làm identity; không bật forwarded-header parsing chỉ vì có proxy.

Chạy migrations với credential riêng và cấp quyền runtime theo [backend README](../backend/README.md) trước khi mở container phục vụ đơn. Không chạy migration bằng runtime user và không để schema owner credential ở FE/Vercel. DB chưa được owner tạo; image/config sẵn sàng nhận env sau.

## 2. Import repo vào Vercel

Chọn **Root Directory = repo root** (để trống hoặc `.`), không chọn `frontend/`. Framework Vite. Config ở `vercel.mjs` tự đặt:

| Mục | Giá trị |
| --- | --- |
| Install | `npm --prefix frontend ci` |
| Build | `npm --prefix frontend run build` |
| Output | `frontend/dist` |
| API route | `/api/:path*` → `<BACKEND_ORIGIN>/api/:path*` |
| SPA fallback | các route giao diện → `/index.html`; không biến API hoặc assets thiếu thành HTML |

Vercel đọc file config programmatic ở root. Dùng một file config này, không thêm `vercel.json` cạnh nó. Config sẽ từ chối deploy nếu BACKEND_ORIGIN thiếu/sai, thiếu Supabase public config, key là secret/service key, hoặc FE gọi API khác origin. Không có URL giả hardcode.

## 3. Vercel environment variables

| Biến trên Vercel | Giá trị |
| --- | --- |
| `BACKEND_ORIGIN` | Origin HTTPS thật của BE, ví dụ định dạng `https://<backend-host>`, không thêm `/api/v1`, query hay key |
| `VITE_API_BASE_URL` | `/api/v1` |
| `VITE_SUPABASE_URL` | URL project Supabase đúng môi trường |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/public client key cho Auth |

DB password, service/secret key Storage, key ký cookie và key mã hóa idempotency chỉ đặt trên host BE. Vercel FE không cần những key đó. `BACKEND_ORIGIN` không phải secret, được đọc khi tạo route config.

Tách Production/Preview. Preview dùng backend và Supabase dev, với domain preview ổn định được thêm vào CORS; không cho tất cả `*.vercel.app`. Nếu muốn mỗi preview có domain riêng, thêm chính xác origin đó vào backend dev trước khi kiểm thử guest. Không dùng preview để thao tác DB production.

Supabase Auth: thêm production domain vào Site URL và allowlist redirect URLs thực tế (`/auth/callback`, `/reset-password` và các redirect của FE). Domain preview chỉ nằm trong project dev. Kiểm tra FE redirect thực tế khi agent FE cập nhật. Sau thay đổi Vite env, cần redeploy vì biến VITE được nhúng lúc build.

## 4. Smoke test sau deploy

1. BE readiness 200 trước khi cấu hình Vercel BACKEND_ORIGIN.
2. `https://<website>/api/v1/shop` trả JSON, không HTML; response API có no-store, không có CDN cache hit dữ liệu riêng tư.
3. Mở trực tiếp `/checkout`, `/guest-order`, `/seller/orders` và refresh: SPA được tải; `/api/v1/khong-ton-tai` không trả index.html.
4. Guest tạo session qua `/api/v1/checkout/session`; kiểm tra Set-Cookie Secure/HttpOnly/Lax và cookie được gửi cùng origin tới `/orders`. Nếu Origin bị proxy thay đổi, sửa routing/deployment; không bỏ Origin protection.
5. Đặt đơn guest → lưu khóa chủ động → lookup → seller contact/accept/payment/complete → kiểm tra tồn/audit. Lặp lại account order và reject/refund trên dev.
6. Upload ảnh/QR thật trên dev; QR private có signed URL, không lộ qua public shop endpoint.

Kiểm tra config local không cần tài khoản hoặc key:

```sh
node --test deployment/vercel-config.test.mjs
```

Các mục chưa xác nhận: backend host/domain, Supabase credentials, Vercel project/env và health/cookie/proxy thực tế. Docker daemon hiện chưa chạy nên Docker image chưa được build tại máy này. Không coi những mục đó là đã deploy/test thành công.

Kiểm tra local đã chạy: 4 test routing/config pass, build FE (`tsc -b && vite build`) pass, backend Maven packaging pass sau khi thêm PORT. FE build chỉ tạo artifact trong `frontend/dist`, không sửa source. Việc deploy thực tế và build Docker image còn chờ môi trường tương ứng.
