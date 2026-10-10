# Đăng ký người bán

Trang riêng `/register-seller`, liên kết từ đăng nhập, đăng ký khách hàng và menu điện thoại. Người dùng nhập mã do shop cấp, họ tên, email và mật khẩu 8–128 ký tự; xác nhận mật khẩu trước khi gửi. Tạo thành công rồi đăng nhập sẽ mở `/seller`.

Backend cần `SELLER_REGISTRATION_CODE` và các biến Supabase hiện có. Mã đã được lưu trong `backend/.env` local; khi triển khai, đặt cùng giá trị trong môi trường backend/Vercel rồi redeploy. Không dùng tiền tố `VITE_`. Thiếu cấu hình thì đăng ký đóng và hiển thị thông báo phù hợp. Không cần migration mới.

`POST /api/v1/auth/register-seller` kiểm tra Origin, giới hạn 5 lần/phút/IP bằng bộ đếm dùng chung trong PostgreSQL, so sánh mã tại server, rồi gọi Admin Auth API tạo tài khoản mới. Email được xác nhận để tài khoản có thể đăng nhập ngay; mã đăng ký là điều kiện cấp quyền. Email đã tồn tại bị từ chối, không sửa mật khẩu hoặc nâng quyền tài khoản cũ. Mã và backend secret không xuất hiện trong frontend bundle hoặc response.

Role quản lý được lưu tại `shop.profiles`, không lấy từ dữ liệu người dùng tự chỉnh sửa. Admin Auth API ghi dấu `app_metadata.seller_shop_id` cho shop hiện tại để `/me` có thể tạo lại hồ sơ bị thiếu nếu Auth đã tạo tài khoản nhưng kết nối database bị gián đoạn. Hồ sơ đã tồn tại giữ nguyên quyền/trạng thái; tài khoản bị khóa không được kích hoạt lại. Xem [Supabase Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Mỗi người bán có hồ sơ và thông tin đăng nhập riêng nhưng cùng truy cập kho, sản phẩm, combo, đơn hàng và cấu hình của `APP_SHOP_ID`. Kiểm tra version hiện có vẫn ngăn ghi đè khi hai người sửa cùng dữ liệu.

Form có loading, khóa trường nhập và ngăn gửi lặp. Mã sai, email trùng, mật khẩu yếu, giới hạn yêu cầu, lỗi mạng và kết quả chưa xác định hiển thị thông báo tại form; không hiển thị SQL, stack trace hoặc mã hỗ trợ nội bộ. Kết quả ghi chưa xác định hướng dẫn thử đăng nhập trước khi đăng ký lại.

Kiểm tra tự động:

- `npm.cmd --prefix backend test`: validation, quyền SELLER, metadata giả, tài khoản khóa, retry cấp hồ sơ, Origin/rate limit và hai người bán cùng chỉnh tồn kho trong PostgreSQL embedded.
- `seller-registration.spec.ts`: đăng ký → đăng nhập → quản lý, loading/gửi lặp, lỗi/retry, kết quả chưa xác định, responsive 320/768/1440; Chromium desktop/mobile, Firefox và WebKit.
- `auth-orders.spec.ts`, `navigation.spec.ts`: hồi quy xác thực, role khách hàng và điều hướng.
- TypeScript app/e2e, lint, build và `git diff --check`.

Kiểm tra Auth thật là opt-in: đặt `RUN_LIVE_AUTH_REGISTRATION_CHECK=true`, chạy `node backend/scripts/seller-registration-live-check.mjs`. Script tạo hai tài khoản Supabase tạm, đăng nhập và kiểm tra JWT/quyền/kho dùng chung với DB embedded độc lập, sau đó xóa tài khoản thử. Không kết nối database shop thật. Manifest tài khoản tạm trong `backend/.tools/` chỉ giữ lại nếu dọn tài khoản thất bại; không chứa mật khẩu hay token. Trước khi dọn, script đối chiếu email thử để tìm cả tài khoản đã tạo khi response bị gián đoạn.

Kết quả ngày 10/10/2026: 34/34 backend, 11/11 deployment, 58/58 Playwright Chromium desktop/mobile (gồm hồi quy auth/điều hướng), 22/22 Firefox/WebKit. TypeScript app/e2e, lint (0 lỗi, 11 cảnh báo có sẵn), build và kiểm tra whitespace đạt. Kiểm tra Supabase Auth thật đạt với hai tài khoản độc lập cùng chỉnh kho; tài khoản thử đã được dọn. Kết nối mạng có lúc timeout, bộ kiểm tra giữ nguyên email thử khi retry.
