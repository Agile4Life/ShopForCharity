# Khách chủ động chọn địa điểm nhận hàng — 12/10/2026

Checkout mở sẵn “Tự chọn địa điểm”. Khách nhập địa điểm và chỉ dẫn riêng, hoặc chuyển sang “Chọn gợi ý của shop” để chọn một điểm đang hoạt động do shop thiết lập. Không tự chọn điểm duy nhất của shop. Đổi lựa chọn giữ bản nháp, nhưng request chỉ gửi địa điểm thuộc lựa chọn hiện tại. Shop chưa có gợi ý vẫn đặt được với địa điểm riêng.

Backend Node kiểm tra chỉ có một loại địa điểm, trim dữ liệu và lưu snapshot tên/chỉ dẫn trên đơn. Địa điểm riêng dùng `pickup_point_id = null`, không tạo thêm điểm nhận của shop. Đơn và giữ hàng vẫn được tạo trong cùng transaction, có idempotency. Chi tiết đơn của khách/shop hiển thị địa điểm và chỉ dẫn đã lưu.

Shop ghi nhận liên hệ thành công trước khi xác nhận. Form có lựa chọn giữ địa điểm khách chọn, dùng được khi không có điểm shop đang hoạt động. Khi giữ địa điểm, request xác nhận bỏ `confirmedPickupPointId`; backend giữ tên/chỉ dẫn hiện tại và xác nhận giờ hẹn. Chỉ đổi sang điểm gợi ý sau khi thống nhất với khách. Email xác nhận tiếp tục dùng snapshot địa điểm/chỉ dẫn của đơn.

Trước khi chạy backend đã cập nhật trên một DB hiện có, áp dụng migration `V8__customer_pickup_location.sql` bằng `npm.cmd --prefix backend run migrate` với cấu hình DB đúng môi trường. Migration bỏ NOT NULL của `orders.pickup_point_id`, giữ dữ liệu và khóa ngoại của điểm gợi ý. Lượt này chỉ áp dụng migration trên PostgreSQL nhúng dành cho test; chưa thay đổi DB thật hoặc deploy.

Kiểm thử liên quan:

```powershell
npm.cmd test
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:e2e:types
npm.cmd --prefix frontend run test:e2e -- e2e/customer-pickup.spec.ts e2e/catalog-checkout.spec.ts e2e/buy-now.spec.ts e2e/pickup-schedule.spec.ts e2e/pickup-points.spec.ts e2e/seller.spec.ts --workers=2
```

Kết quả: **71/71 test backend + 12/12 test cấu hình triển khai**, frontend build/typecheck đạt; **114/114 Playwright desktop/mobile đạt** (4,6 phút), gồm 10 ca địa điểm khách chọn. Lint không có lỗi, còn warning có sẵn trong các phần khác.

Test backend chạy SQL thật trên PostgreSQL nhúng: migration, tạo đơn, đọc lại, xác nhận, replay không giữ hàng lặp, dữ liệu sai rollback và điểm gợi ý không hoạt động bị từ chối. Playwright dùng API fixture để kiểm tra luồng trên Chromium desktop/Pixel 7. Cấu hình test local trong `.tools/customer-pickup/playwright.local.config.ts` dùng Chromium revision 1243 có sẵn vì máy chưa có revision 1248 mà package Playwright hiện tại yêu cầu. Báo cáo XML ở `.tools/customer-pickup/playwright.xml`; chạy ngoài sandbox để Playwright dọn tiến trình Windows bình thường.
