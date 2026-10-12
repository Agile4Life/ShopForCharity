# Dọn dữ liệu trước khi vận hành chính thức

Đã thực hiện ngày 12/10/2026 trên Supabase project `htmramdkoevxzjqcpesb`, database đang phục vụ `https://goiamchoem.vercel.app`, theo yêu cầu xoá sản phẩm và lịch sử, giữ tài khoản.

- Đã xoá 1 sản phẩm, 8 đơn hàng và toàn bộ dữ liệu liên quan: tồn kho, thành phần đơn/combo, giữ hàng, biến động kho, liên hệ khách, trạng thái, thanh toán, thông báo, audit, idempotency, email chờ gửi và hội thoại/tin nhắn cũ.
- Đã xoá metadata ảnh sản phẩm và 2 file ảnh gốc/thumbnail bằng API Storage. Không xoá trực tiếp metadata `storage.objects` bằng SQL.
- Đối chiếu toàn bộ bản ghi trước/sau xác nhận giữ nguyên 3 tài khoản Auth, 2 hồ sơ ứng dụng, shop, danh mục, điểm nhận, cấu hình ngân hàng và QR.
- Kiểm tra lại các bảng nghiệp vụ đều có 0 bản ghi; Storage chỉ còn QR ngân hàng trong hai bucket liên quan.
- API production `/api/v1/products` và `/api/v1/combos` trả HTTP 200, `content: []`, `totalElements: 0`.
- `npm.cmd test` đạt 74 kiểm thử backend và 12 kiểm thử cấu hình triển khai. Bài kiểm thử reset kiểm tra quan hệ dữ liệu, bảo toàn tài khoản/cấu hình, chạy lại an toàn và từ chối database có nhiều shop.

Script `backend/scripts/reset-business-data.sql` là thao tác bảo trì thủ công cho đúng shop đã cấu hình; không chạy khi khởi động, migration hoặc deploy. Transaction tự rollback nếu kiểm tra bảo toàn thất bại hoặc đang có email được xử lý. Khi dùng lại, phải chụp danh sách đường dẫn ảnh sản phẩm trước khi xoá metadata và xoá file qua API Storage riêng.

Đây là thao tác dọn dữ liệu production; không tạo deployment mới. Không lưu dữ liệu tài khoản hoặc nội dung lịch sử vào báo cáo này.
