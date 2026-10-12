# Kiểm tra các luồng chính trước khi hoạt động chính thức

Ngày kiểm tra: 12/10/2026. Website: https://goiamtraoem.shop, tự chuyển sang https://www.goiamtraoem.shop.

## Kết quả đã kiểm chứng

| Phạm vi | Kết quả | Môi trường |
| --- | --- | --- |
| Playwright giao diện desktop/mobile Chromium | 516 kịch bản đạt sau sửa và kiểm tra lại | Frontend build; API/Auth dùng fixtures |
| Playwright tích hợp mua hàng và thiết lập điểm nhận | 2 bài đạt, gồm luồng mua hàng 15 bước | Controller thật, PostgreSQL PGlite tách riêng, Supabase Auth/Storage thật |
| Playwright chat desktop/mobile Chromium | 4 bài đạt | Backend local; PostgreSQL, Auth và Realtime Supabase thật |
| Backend và cấu hình triển khai | 74 + 12 kiểm thử đạt; `npm.cmd test` exit 0 | Local |
| Build frontend và TypeScript | Đạt | Build thường và build vào thư mục riêng; types E2E, integration và chat |
| Website chính thức | Catalog → chi tiết → giỏ → checkout đạt; phiên checkout và báo giá HTTP 200 | Playwright trên domain thật |

Tổng cộng 522 kịch bản Playwright độc lập. Không cộng các lượt chạy lại vào tổng này. Bộ đầy đủ ban đầu đạt 500/516; 16 ca còn lại đều đạt trong lượt kiểm tra lại, đã đối chiếu ID từng ca giữa hai report. Không có ca bỏ qua ở hai lượt này.

## Những luồng đã kiểm tra

- Xem/tìm/lọc sản phẩm và combo, mua ngay, thay đổi số lượng, giữ giỏ sau reload, xử lý hết hàng và đổi giá.
- Khách tự nhập địa điểm nhận mặc định; chọn gợi ý shop khi muốn; giữ bản nháp khi chuyển lựa chọn; kiểm tra địa điểm trống; shop giữ địa điểm khách yêu cầu khi xác nhận.
- Tạo đơn khách vãng lai và khách đăng nhập, tra cứu đơn, giữ mã/token để tra cứu, mã đơn ngắn dễ đọc/copy và thông báo mở đúng đơn.
- Thanh toán tiền mặt và chuyển khoản: QR riêng tư, báo chuyển khoản chỉ chuyển sang REPORTED, người bán xác nhận số tiền, cập nhật tồn kho và các nhánh huỷ/từ chối/hoàn tiền.
- Đăng nhập/đăng xuất, hồ sơ, đăng ký, recovery và chặn trang theo quyền. Các ca email đăng ký/reset trong bộ giao diện dùng fixtures.
- Quản lý sản phẩm/ảnh, combo, tồn kho, thiết lập shop, điểm nhận, lịch hẹn, thông báo và lịch sử.
- Chat thật: ngữ cảnh sản phẩm, hai người bán chung hộp thư, tin chưa đọc, phản hồi qua WebSocket, chặn khách khác đọc/gửi vào hội thoại, gửi lại sau mất phản hồi chỉ tạo một tin.
- Giao diện nhiều kích thước, thao tác chạm, bàn phím, lỗi mạng, phản hồi không xác định, tải trang lỗi và giảm chuyển động.

## Vấn đề tìm thấy và xử lý

1. **Database đang phục vụ website thiếu migration V8.** Cột `shop.orders.pickup_point_id` còn NOT NULL, có thể làm đơn nhận tại địa điểm khách nhập thất bại. Đã áp dụng migration V8, ghi checksum đúng vào ledger và xác minh cột nullable. Không thay đổi dữ liệu tài khoản/sản phẩm. Luồng tích hợp đã xác nhận địa điểm và chỉ dẫn của khách được lưu, giữ sau shop xác nhận và thanh toán.
2. Một số bài test cũ chưa nhập địa điểm khách chọn. Đã cập nhật dữ liệu nhập và tăng kiểm tra snapshot địa điểm ở bài tích hợp.
3. Bài kiểm tra thao tác chạm được chọn bởi project desktop nhưng chưa bật `hasTouch`. Đã bật chế độ chạm cho suite này.
4. Bài chat bấm nút hỏi ngay lúc đang chuyển trang, đôi lúc khớp hai nút trên danh mục cũ. Đã chờ trang chi tiết đúng sản phẩm và chọn nút bằng tên sản phẩm chính xác; cả 4 bài chat đạt khi chạy lại.
5. Bài rate limit backend có thể chạy qua ranh giới phút. Đã cố định đồng hồ SQL trong riêng bài test; vẫn kiểm tra 30 yêu cầu được phép và yêu cầu thứ 31 bị chặn. Không đổi logic production.
6. Một lượt build thường ghi đè build mà bộ Playwright đang dùng, làm sai cấu hình Auth ở một số ca. Đã khôi phục và kiểm tra lại bằng thư mục build riêng. Các ca hết thời gian trên máy local cũng đạt khi kiểm tra lại; không có lỗi còn mở trong bộ đã chạy.

## Domain và triển khai

Kiểm tra trực tiếp với Origin `https://goiamtraoem.shop` trả 403 CSRF; trình duyệt thực tế được chuyển sang `https://www.goiamtraoem.shop`, nơi phiên checkout và báo giá trả 200. Vì vậy kết quả 403 của Origin trước chuyển hướng không chứng minh checkout trên website bị lỗi.

Đã cập nhật Origin mặc định của công cụ chuẩn bị môi trường và tài liệu thành `https://www.goiamtraoem.shop`; project Vercel là `shopforcharity`. File môi trường private được chuẩn bị lại, không commit. Không sửa biến môi trường Vercel hay tạo deployment mới trong lượt kiểm tra này. Thay đổi online đã thực hiện là migration database V8.

## Dọn dữ liệu thử và giới hạn

Đã xoá đúng tài khoản Auth, profile, hội thoại, bộ đếm và file Storage do các bài test tạo. Kiểm tra sau cùng trên Supabase: **3 tài khoản Auth, 2 profile, 2 sản phẩm, 0 đơn, 5 file Storage, 0 hội thoại và 0 tin nhắn**, khớp dữ liệu trước khi thử. File lưu tài khoản chat thử đã được xoá. Server local cho người dùng vẫn chạy ở http://localhost:5173.

Chưa tạo đơn thật trên domain chính thức, chưa xác minh email đến hộp thư thực tế và chưa chuyển tiền ngân hàng thật. Luồng đơn hàng tích hợp dùng PGlite một kết nối, không chứng minh khả năng chịu tải hoặc tranh chấp trên PostgreSQL production. Lượt này kiểm tra Chromium desktop/mobile; chưa xác minh Safari/Firefox thực tế.

## Bằng chứng trong workspace

- [Report lượt đầy đủ: 500 đạt, 16 cần kiểm tra lại](../.tools/main-flows/html/index.html).
- [Report kiểm tra lại: 16 đạt](../.tools/main-flows/recheck-report-html/index.html).
- [Đối chiếu 516 ID và kết quả trên domain thật](../.tools/main-flows/verified-summary.json).
- [Report tích hợp](../.tools/main-flows/integrated-report.json).
- [Report chat thật: lượt cuối 4 đạt](../frontend/playwright-report/chat-live/index.html).
- [Log backend/cấu hình triển khai](../.tools/main-flows/backend-tests-final.log).

Các artifact test trên nằm trong thư mục được Git ignore và có sẵn ở máy đã chạy kiểm tra. Trên Windows, tiến trình preview của bộ giao diện không tự thoát; đã dừng đúng tiến trình preview của test sau khi toàn bộ ca hoàn tất. Lượt kiểm tra lại và lượt chat cuối đều kết thúc exit 0.
