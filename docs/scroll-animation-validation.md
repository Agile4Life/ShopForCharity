# Animation khi cuộn và scrollbar — 10/10/2026

Đã hoàn tất phần giao diện và kiểm tra trên bản local. Chưa triển khai production.

## Thay đổi

- Các tiêu đề, toolbar catalog, thẻ sản phẩm/combo, bước nhận hàng, khối chi tiết, giỏ hàng, checkout và card quản lý xuất hiện nhẹ khi cuộn tới: fade và trượt lên 16px trong 280ms. Các nhóm thẻ desktop xuất hiện cách nhau tối đa 90ms; mobile không có độ trễ giữa thẻ.
- Nội dung đã nằm trong màn hình hiện ngay. Mỗi khối chỉ xuất hiện một lần trong lần mở trang; dữ liệu API tới sau vẫn được xử lý. Không ẩn toàn bộ section catalog dài.
- Dùng IntersectionObserver và CSS, không thêm thư viện hoặc listener theo từng sự kiện scroll. Gom đọc vị trí trước khi cập nhật class và gom các thay đổi DOM theo frame.
- Focus bàn phím làm khối chứa thao tác hiện ngay. Chế độ reduced motion, thay đổi chế độ giữa phiên, fallback khi thiếu IntersectionObserver và các card rất dài đều giữ nội dung đọc được. Modal không bị gắn hiệu ứng scroll.
- Scrollbar dùng màu xanh rừng và nền giấy của theme, có màu hover ở vùng cuộn menu/form/table. Giữ kích thước native trên thiết bị cảm ứng và màu hệ thống ở chế độ tương phản cao.

## Kết quả kiểm tra cuối cùng

| Kiểm tra | Kết quả |
| --- | --- |
| Production build qua webServer Playwright | Đạt |
| TypeScript ứng dụng và E2E | Đạt |
| Lint | Không có lỗi; 11 cảnh báo có sẵn |
| Playwright desktop/mobile Chromium | **214/214 đạt**, JUnit ghi 0 failure, 0 error |
| Ca mới về scroll, focus, reduced motion, fallback, scrollbar | **14/14 đạt**, nằm trong 214 ca trên |
| Integration thêm điểm nhận và luồng mua–thanh toán | **2/2 đạt** |
| Các bước mua–thanh toán trong integration | **15/15 đạt**, không có API lỗi |
| Dọn dữ liệu ảnh kiểm thử Supabase | Đã xóa 3 object |
| git diff --check | Đạt |

Integration dùng UI/backend local, PostgreSQL WASM cô lập và Supabase Auth/Storage thật. Không tạo đơn hoặc sửa dữ liệu shop trong DB production. Đã kiểm tra chuyển khoản, tiền mặt, liên hệ/chấp nhận đơn, chặn hoàn tất khi chưa PAID, bàn giao, cập nhật tồn kho và ẩn sản phẩm tự cập nhật trên tab khách.

Kịch bản integration được bổ sung chọn điểm nhận vừa tạo ở cả checkout chuyển khoản và tiền mặt. Khi chạy nhiều test chung DB kiểm thử, có nhiều điểm active nên không thể dựa vào mặc định tự chọn khi chỉ có một điểm.

## Kết quả và ảnh chụp

- Log full suite: `.tools/scroll-motion-full.log`; JUnit: `frontend/test-results/playwright.xml`.
- Log integration: `.tools/scroll-motion-integration.log`.
- HTML report: `frontend/playwright-report/index.html` và `frontend/playwright-report/integrated/index.html`.
- Ảnh desktop: `frontend/test-results/scroll-motion-sections-rev-0580c-he-page-within-the-viewport-desktop-chromium/scroll-reveal.png`.
- Ảnh mobile: `frontend/test-results/scroll-motion-sections-rev-0580c-he-page-within-the-viewport-mobile-chromium/scroll-reveal.png`.

Đã xem ảnh desktop/mobile. Đây là kiểm tra browser trong môi trường local; không thay thế đo trên website sau triển khai hoặc kiểm thử riêng trên Safari/Firefox.
