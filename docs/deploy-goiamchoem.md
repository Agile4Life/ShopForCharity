# Deploy goiamchoem.vercel.app

Repo đã cấu hình một Vercel project cho cả React/Vite và Node/Express. Cấu hình dự kiến dùng gói Hobby với cron daily.

## Import project

Đẩy các thay đổi code lên Git repository rồi import trên Vercel:

| Setting | Giá trị |
| --- | --- |
| Project Name | goiamchoem |
| Root Directory | Root repository (`.`), không phải frontend hoặc backend |
| Framework Preset | Vite |
| Node.js Version | 24.x |
| Install Command | Theo vercel.mjs: frontend ci --include=dev, backend ci --omit=dev |
| Build Command | npm --prefix frontend run build |
| Output Directory | frontend/dist |

Build/output/install đã có trong vercel.mjs; không cần ghi đè trên dashboard. Tên/domain cuối cùng phụ thuộc tên còn khả dụng và domain được gán cho project.

## Environment Variables

File private đã chuẩn bị tại `.vercel/deploy.env`, bị Git ignore. Trong phần Environment Variables của project, import file hoặc paste nội dung vào form, chọn môi trường **Production** và lưu trước lần deploy đầu tiên. File chứa runtime credentials và secret, không chứa migration credentials. Không đưa file này lên Git.

File đã có CORS_ALLOWED_ORIGINS=https://goiamchoem.vercel.app, COOKIE_SECURE=true, MIGRATIONS_ENABLED=false, SERVERLESS_BACKEND=true, API base /api/v1, secret cron mới và PostgreSQL transaction pooler port 6543. Các key session/encryption hiện tại được giữ nguyên. CA Supabase được đóng gói cùng Function.

Có thể tạo lại file mà vẫn giữ secret cron đã tạo:

```powershell
npm.cmd run prepare:vercel
```

Nếu đổi domain:

```powershell
npm.cmd run prepare:vercel -- https://domain-moi.example
```

Backend cho phép chính xác các URL deployment/branch/production của Vercel từ System Environment Variables. Bật **Automatically expose System Environment Variables** trong project settings. Origin tùy chỉnh lấy từ CORS_ALLOWED_ORIGINS; không mở wildcard.

Preview cần bộ biến môi trường riêng, ưu tiên DB/Supabase test riêng; cấu hình tương ứng trước khi tạo preview. File hiện tại chuẩn bị từ DB/Supabase đang dùng ở local cho production domain do người dùng chọn.

## Supabase Auth

Trong Supabase → Authentication → URL Configuration:

- Site URL: `https://goiamchoem.vercel.app`
- Redirect URLs: `https://goiamchoem.vercel.app/auth/callback`
- Redirect URLs: `https://goiamchoem.vercel.app/reset-password`

Nếu kiểm tra Auth trên preview, thêm URL callback/reset của deployment đó. [Tài liệu redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Sau khi deploy

- GET `https://goiamchoem.vercel.app/actuator/health/liveness` phải trả UP.
- GET `https://goiamchoem.vercel.app/actuator/health/readiness` phải trả UP.
- Kiểm tra login/reset, guest checkout cookies, quyền seller và upload trước khi mở nhận đơn.
- Cron expire chạy 07:00 Việt Nam mỗi ngày; cleanup 08:00. Chỉ bật lịch thường xuyên khi gói hỗ trợ.

Đã kiểm tra unit/embedded/config tests, frontend production build, TLS qua transaction pooler và session cookie với production/preview origin trong môi trường mô phỏng. Chưa đăng nhập hoặc tạo project/deployment trên tài khoản Vercel.

Tham khảo [Vercel environment variables](https://vercel.com/docs/environment-variables) và [System Environment Variables](https://vercel.com/docs/environment-variables/system-environment-variables).
