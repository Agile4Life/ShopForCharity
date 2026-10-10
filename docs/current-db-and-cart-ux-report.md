# Kiểm tra Supabase và UX giỏ hàng — 10/10/2026

Domain hiện tại: https://goiamchoem.vercel.app.

## Kết quả DB thật

Kiểm tra trực tiếp database đang cấu hình trong `backend/.env` bằng role `shop_runtime`, qua Supabase pooler và TLS có xác thực CA. Các truy vấn kiểm tra schema/dữ liệu chạy trong transaction `READ ONLY`.

| Hạng mục | Kết quả |
| --- | --- |
| Schema theo migration V1–V4 | Đủ 22 bảng nghiệp vụ; không thiếu cột, ràng buộc PK/FK/unique/check hoặc index; kiểu dữ liệu và nullable khớp |
| Frontend, backend, JWT issuer | Cùng Supabase project |
| Runtime | Migrations tắt, pool tối đa 3 kết nối |
| Quyền dữ liệu | Các bảng nghiệp vụ có quyền cần thiết; audit, lịch sử trạng thái, liên hệ, thanh toán, biến động kho và phiên bản ngân hàng không được sửa/xóa |
| Truy cập trực tiếp từ browser | `anon` và `authenticated` không có quyền USAGE trên schema `shop`; thao tác nghiệp vụ đi qua backend |
| Storage | `product-images` public; `payment-qr` private; ảnh sản phẩm thật tải HTTP 200 |
| Tồn kho và đơn | Không thiếu bản ghi kho, không sai stock/reservation, không lệch tổng đơn, không có đơn hoàn tất chưa thanh toán |
| Tài khoản | Có 1 profile SELLER active; đăng nhập Supabase và `/me` trên domain mới xác nhận SELLER |

DB thật hiện có **1 sản phẩm ACTIVE**, **0 combo**, **0 đơn**, **0 điểm nhận hàng**, chưa có phiên bản thông tin ngân hàng. Shop vẫn `accepting_orders=false`, `version=0`. Việc đã đưa dữ liệu lên Supabase không tự mở nhận đơn; cần cấu hình điểm nhận và lưu bật nhận đơn trong trang seller. Ngân hàng/QR cần cho phương thức chuyển khoản.

Do DB chưa có đơn thật, các kiểm tra nhất quán đơn chỉ xác nhận trạng thái hiện tại; không thay thế kiểm tra nghiệp vụ bằng dữ liệu kiểm thử. Role runtime không được đọc bảng lịch sử migration, nên kiểm tra này đối chiếu cấu trúc thực tế với SQL V1–V4, không chứng nhận checksum lịch sử migration.

## Backend và domain mới

- Backend local dùng DB thật: 16 endpoint đọc public/seller đạt HTTP 200, cộng ảnh sản phẩm HTTP 200.
- Backend đã deploy tại `goiamchoem.vercel.app`: cùng 16 endpoint đạt HTTP 200, gồm readiness, shop, danh mục, sản phẩm/chi tiết, combo, `/me`, cấu hình shop, điểm nhận, danh sách sản phẩm/combo/đơn, dashboard, thông báo và audit.
- Trang chủ domain mới HTTP 200. Trạng thái tắt nhận đơn trên API deploy khớp DB thật.
- Cập nhật domain mặc định trong `deployment/deploy-env.mjs`, tests và tài liệu deploy; tái tạo file private `.vercel/deploy.env` với `CORS_ALLOWED_ORIGINS=https://goiamchoem.vercel.app`. File này cần được import vào Vercel nếu cấu hình môi trường trên dashboard chưa cập nhật.
- Hướng dẫn Supabase Auth Site URL/callback/reset theo domain mới nằm trong [hướng dẫn deploy](deploy-goiamchoem.md). Chưa đọc hoặc sửa URL Configuration trên Supabase dashboard trong lượt này.

## Thay đổi UX

Tất cả nút thêm sản phẩm/combo ở gian hàng và trang chi tiết dùng chung `AddToCartButton`:

- Lấy lại giá và tồn kho hiện tại từ backend trước khi thêm vào giỏ.
- Hiện spinner và nhãn “Đang thêm…” trong thời gian request thực tế; khóa nút/chặn bấm lặp.
- Thành công: dấu tick, nhãn “Đã thêm vào giỏ”, thông báo tên/số lượng và link “Xem giỏ”.
- Lỗi mạng, món ngừng bán/hết hàng hoặc vượt số lượng: thông báo lỗi, giữ giỏ và cho thử lại. Request có timeout 15 giây.
- Kiểm tra số lượng đã có trong giỏ cùng tồn kho mới; các request thêm nhiều món cùng lúc không ghi đè mất dòng giỏ.
- Spinner/toast đồng bộ giao diện; hỗ trợ `aria-busy`, status/alert và `prefers-reduced-motion`. Giỏ được lưu localStorage; đặt đơn mới ghi vào DB và giữ hàng.

## Kiểm chứng

| Bộ kiểm tra | Kết quả |
| --- | --- |
| Backend unit/embedded DB | 29/29 pass |
| Deployment contract | 10/10 pass |
| Playwright giỏ hàng/catalog/checkout, desktop + mobile | 38/38 pass |
| Playwright giao diện local với DB Supabase thật | Desktop + mobile pass: loading, toast, link giỏ, giữ giỏ sau reload, chặn checkout khi shop đóng; không có API lỗi |
| Playwright flow tích hợp 15 bước | 15/15 pass: sản phẩm → cập nhật catalog → giỏ → chuyển khoản → xác nhận/hoàn tất → tiền mặt → ẩn sản phẩm |
| Frontend build, typecheck E2E/integration | Pass; lint không lỗi, còn warning có sẵn |

Flow tạo sản phẩm/đơn/thanh toán sử dụng **DB kiểm thử riêng**, Supabase Auth/Storage thật. Không mở shop hoặc tạo đơn trên DB thật; đã xóa 3 ảnh Storage tạm của lượt kiểm thử. Cải tiến UX đang ở code local, chưa deploy trong lượt này.

## Bằng chứng và chạy lại

- [DB snapshot](../.tools/db-audit/current-db.json)
- [API deploy](../.tools/db-audit/deployed-api.json)
- [Playwright với DB thật](../.tools/db-audit/real-browser.json)
- [Ảnh desktop](../.tools/db-audit/desktop-cart-success.png), [ảnh mobile](../.tools/db-audit/mobile-cart-success.png)

Các artifact nằm trong thư mục Git ignore. Script audit chỉ in cấu trúc/số lượng/status, không in credentials hoặc thông tin người mua.

```powershell
node backend/scripts/audit-current-db.mjs
node backend/scripts/audit-current-api.mjs
# Để kiểm tra API deploy, đặt AUDIT_API_ORIGIN=https://goiamchoem.vercel.app.
# Để kiểm tra seller, cung cấp E2E_SELLER_EMAIL và E2E_SELLER_PASSWORD qua env.

cd frontend
npm.cmd run test:e2e -- e2e/cart-feedback.spec.ts e2e/catalog-checkout.spec.ts
```
