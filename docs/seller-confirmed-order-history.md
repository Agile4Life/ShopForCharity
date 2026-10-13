# Tổng hợp đơn đã xác nhận trong Nhật ký

Trong **Nhật ký**, chọn **Đơn đã xác nhận** để xem một dòng cho mỗi đơn đã xử lý thành công. Mục **Tất cả hoạt động** tiếp tục hiển thị nhật ký thao tác, tồn kho và thiết lập.

Danh sách tổng hợp gồm mã đơn, tên/số điện thoại khách, thời điểm và người xác nhận, điểm/lịch nhận hàng, giá trị đơn và trạng thái thanh toán. Mã đơn mở chi tiết đơn. Có tìm mã đơn (chấp nhận chữ thường và khoảng trắng giữa nhóm mã), lọc ngày xác nhận và phân trang.

Ba chỉ số tổng hợp theo toàn bộ kết quả khớp bộ lọc, không chỉ trang đang xem: số đơn, tổng giá trị đơn và giá trị các đơn đã thanh toán. Tổng giá trị bao gồm cả đơn chưa thanh toán; chỉ số đã thanh toán chỉ tính `payment_status = PAID`.

## Quy tắc dữ liệu

- API `GET /api/v1/seller/confirmed-orders` chỉ cho người bán đang hoạt động và chỉ đọc đơn của shop hiện tại.
- Các trạng thái được tổng hợp: `ACCEPTED`, `PREPARING`, `READY`, `COMPLETED`. Các đơn đang chờ, đã hủy, bị từ chối hoặc hết hạn không thuộc tổng hợp này.
- Thời điểm xác nhận lấy từ bản ghi `order_status_history` có `to_status = ACCEPTED`. `orders.confirmed_at` là giờ hẹn nhận hàng, được hiển thị riêng.
- Khi có nhiều bản ghi xác nhận, lấy bản ghi mới nhất để không đếm một đơn nhiều lần. Đơn cũ thiếu lịch sử vẫn xuất hiện trong tổng hợp, với thời gian chưa xác định; không thuộc kết quả lọc theo ngày.
- Lọc và hiển thị thời gian theo giờ Việt Nam (`Asia/Ho_Chi_Minh`). Ranh giới ngày là 00:00 Việt Nam, bao gồm đầu ngày và loại trừ đầu ngày kế tiếp.
- Người xác nhận lấy tên hồ sơ gắn với sự kiện xác nhận. Tên/điểm nhận/giá trị đơn lấy từ dữ liệu đơn, không lấy tên sản phẩm hay điểm nhận đã sửa trong catalog.
- Thống kê và danh sách dùng cùng một truy vấn/snapshot SQL. Truy vấn tận dụng các chỉ mục `order_seller_list` và `history_order` hiện có; không cần migration mới.
- Xác nhận, hủy hoặc cập nhật thanh toán qua giao diện làm mất hiệu lực cache tổng hợp để lần mở Nhật ký tiếp theo tải số liệu mới.

## Kiểm chứng local

```powershell
npm.cmd test
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:e2e:types
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run test:e2e -- e2e/confirmed-order-history.spec.ts e2e/seller-logs-display.spec.ts e2e/readable-data.spec.ts e2e/seller.spec.ts e2e/calendar-style.spec.ts --workers=2
```

Backend kiểm tra SQL thật trên PostgreSQL nhúng và controller HTTP có JWT, gồm giới hạn shop/quyền người dùng, trạng thái hợp lệ, chống đếm lặp, ranh giới ngày, mã đơn, phân trang, tổng hợp và dữ liệu cũ. Playwright dùng API fixture để kiểm tra tương tác, số liệu hiển thị, lịch, phân trang, lỗi và giao diện desktop/mobile. Các test không gửi mail hoặc thay đổi dữ liệu shop thật.

Trên máy hiện tại có thể chạy Playwright với `--config ../.tools/confirmed-order-history/playwright.local.config.ts` để dùng Chromium revision 1243 có sẵn. Báo cáo local nằm trong `.tools/confirmed-order-history/`. Kiểm chứng local không phải deployment Preview hoặc production.

Kết quả ngày 13/10/2026: **82/82 test backend + 12/12 cấu hình triển khai đạt**; frontend build/typecheck đạt, lint không có lỗi (còn các warning có sẵn). **76/76 Playwright desktop/mobile đạt**; sau khi bổ sung kiểm tra cuộn và độ hiển thị, chạy lại **12/12 ca của mục mới đạt**. Báo cáo đầy đủ ở `browser-tests.log`, báo cáo kiểm tra cuộn ở `scroll-tests.log` và `playwright.xml`. Chưa triển khai hoặc kiểm thử mục mới trên production.
