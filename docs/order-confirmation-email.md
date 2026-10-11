# Email khi người bán xác nhận đơn hàng

Backend Node gửi email tới `buyer_email` khách đã nhập khi đặt hàng, cho cả khách có tài khoản và khách vãng lai. Email được tạo khi người bán duyệt đơn thành `ACCEPTED`; không gửi khi chỉ ghi nhận liên hệ hoặc xác nhận thanh toán.

Nội dung tiếng Việt gồm mã đơn, tên khách, sản phẩm/số lượng/đơn giá/thành tiền, tổng tiền, phương thức và trạng thái thanh toán, điểm nhận, lịch nhận đã chốt theo giờ Việt Nam và hướng dẫn nhận. Thông tin liên hệ cửa hàng được thêm nếu đã cấu hình. Dữ liệu lấy từ bản chụp đơn hàng; không gửi token truy cập, ghi chú nội bộ hay thông tin đối soát của người bán.

## Cấu hình

1. Trong [Resend](https://resend.com/docs/dashboard/domains/introduction), thêm domain gửi email `goiamtraoem.shop`, cấu hình các bản ghi DNS theo thông tin Resend hiển thị và chờ domain được xác minh. Sau đó tạo API key có quyền gửi email.
2. Đặt hai biến **chỉ ở backend/Vercel Environment Variables**:
   - `RESEND_API_KEY`: API key Resend.
   - `ORDER_EMAIL_FROM`: `Gói Ấm Cho Em <orders@goiamtraoem.shop>` sau khi domain được xác minh.
3. Chạy `npm.cmd --prefix backend run migrate` bằng migration owner để áp dụng `V7__order_confirmation_email.sql`, sau đó triển khai mã mới. Không bật migration trong request Vercel. Migration cấp quyền/policy cho role chuẩn `shop_runtime`; role runtime có tên khác cần owner cấp quyền DML và policy RLS tương đương trên bảng mới.
4. `npm.cmd run prepare:vercel` đã hỗ trợ xuất hai biến email từ cấu hình backend. Không đặt key trong biến `VITE_*`.
5. Trên môi trường thử nghiệm, duyệt đơn dùng email bạn quản lý, kiểm tra email đến và trạng thái bản ghi trong `shop.order_email_outbox`. Chưa có API key/domain thật thì chưa thể kiểm chứng gửi mail thực tế.

## Gửi và thử lại

Đơn và yêu cầu gửi được ghi trong cùng transaction. Chỉ sau COMMIT mới gọi [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email), đợi tối đa 5 giây cho mỗi lần gọi. Lỗi mạng/email không thay đổi kết quả duyệt đơn. Bấm duyệt lại với cùng Idempotency-Key không tạo email mới. Bản chụp nội dung và địa chỉ gửi của lần thử đầu được giữ nguyên cho các lần thử lại.

Server thông thường chạy worker mỗi phút. Serverless có endpoint `GET /api/v1/cron/order-emails`, bắt buộc `Authorization: Bearer <CRON_SECRET>`, xử lý tối đa 5 email mỗi lần. Monorepo Vercel chạy mặc định hàng ngày lúc 02:00 UTC (09:00 Việt Nam); `VERCEL_CRON_FREQUENT=true` chạy mỗi phút nếu gói hỗ trợ. Với nhu cầu thử lại nhanh, cấu hình scheduler ngoài gọi endpoint mỗi phút hoặc bật lịch thường xuyên. Email thông thường vẫn được gửi ngay trong request duyệt đơn, không đợi cron.

Thiếu cấu hình: giữ `PENDING`, chưa tính lần thử. Lỗi mạng, HTTP 429/409/5xx: lùi lịch thử lại từ 1 phút tới tối đa 1 giờ, giới hạn 12 lần. Lỗi HTTP khác: `FAILED`. Worker bị ngắt được worker khác tiếp tục sau lease 2 phút; khóa claim ngăn hai worker lấy cùng email, không giữ transaction mở trong lúc gọi mạng.

[Resend giữ Idempotency-Key trong 24 giờ](https://resend.com/docs/dashboard/emails/idempotency-keys). Hệ thống dừng thử tự động sau 23 giờ tính từ lần thử đầu để tránh gửi trùng nếu kết quả gửi trước đó chưa rõ. Cron hàng ngày có thể vượt cửa sổ này khi một lần gửi đã gặp lỗi; dùng lịch mỗi phút để có các lần thử lại trong cửa sổ đó.

Theo dõi `status`, `attempts`, `last_error`, `sent_at`, `provider_message_id` trong bảng private `shop.order_email_outbox`. `SENT` nghĩa là API Resend đã nhận email; thư bị trả lại/spam cần kiểm tra dashboard Resend. Log chỉ chứa ID đơn và mã lỗi, không ghi email/nội dung/key. Với `FAILED` hoặc `RETRY_WINDOW_EXPIRED`, kiểm tra dashboard trước khi owner chủ động gửi lại; không tự reset hàng loạt vì có thể đã gửi thành công trước khi mất kết nối.

Kiểm thử tự động: `npm.cmd test`. Bài test dùng PostgreSQL embedded và provider giả, kiểm tra COMMIT, replay, rollback, retry, lease, quyền private và bảo vệ cron; không gửi thư cho khách thật.
