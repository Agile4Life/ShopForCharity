# Popup đơn hàng mới cho seller

Seller đang đăng nhập và hoạt động nhận popup trên mọi trang của web. Trên điện thoại, popup nằm phía trên, dưới thanh điều hướng; khi mở menu tài khoản, popup tạm ẩn để thao tác menu. Trên desktop, popup nằm ở góc dưới bên phải, phía trên nút chat. Popup có mã đơn, người mua, tổng tiền và nút **Xử lý đơn** mở `/seller/orders/:id` ngay; thao tác đánh dấu đã đọc chạy riêng để không chặn việc mở đơn.

Popup giữ nguyên cho đến khi đóng hoặc mở đơn. Đóng chỉ ẩn popup trong phiên hiện tại, không đánh dấu đã đọc. Tối đa ba popup hiển thị cùng lúc; các đơn còn lại nằm trong hàng chờ. Khi tab khác của cùng tài khoản đánh dấu thông báo đã đọc, popup tương ứng được gỡ sau khi cập nhật dữ liệu.

Snapshot đầu tiên làm mốc để thông báo cũ không bật lại khi đăng nhập/tải lại trang. Đơn chưa đọc vẫn nằm trong dashboard. Query được tách theo profile; đăng xuất/đổi tài khoản hủy subscription và hàng chờ. Chỉ `ORDER_CREATED` tạo popup.

## Cấu hình Supabase

Áp dụng [seller-notifications-realtime.sql](../backend/deployment/seller-notifications-realtime.sql) bằng schema owner trên Supabase đang dùng cho Auth và database backend. Đây là SQL transport riêng, cùng cách triển khai với `chat-realtime.sql`; không thêm schema `shop` vào Data API và không cần publication Postgres Changes.

Topic private: `seller:notifications:<profileId>`. Trigger INSERT/UPDATE trên `shop.notifications` gửi sự kiện `changed`, payload chỉ chứa notification ID. Client tải nội dung qua API có xác thực. Chính sách SELECT trên `realtime.messages` chỉ cho tài khoản có `auth.uid()` khớp profile seller đang hoạt động nhận đúng topic của mình. Không cấp quyền browser gửi Broadcast. Helper nằm trong schema riêng, `search_path` cố định và thu hồi EXECUTE từ PUBLIC/anon.

Frontend dùng các biến Supabase hiện có. WebSocket nhận sự kiện sau khi transaction đặt đơn commit; rollback không phát thông báo. Khi kết nối lại, frontend tải lại dữ liệu. Nếu transport chưa được cấu hình hoặc WebSocket gián đoạn, polling mỗi 10 giây và refetch khi quay lại tab/mạng vẫn nhận đơn mới. API `GET /seller/notifications?unreadOrders=true&page=0&size=100` phân trang toàn bộ thông báo đơn chưa đọc để tránh bỏ mất đơn khi nhiều đơn tới cùng lúc.

Tài liệu tham khảo: [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

## Kiểm thử local

```powershell
npm.cmd test
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run test:e2e:types
npm.cmd --prefix frontend run test:e2e -- seller-notifications.spec.ts seller.spec.ts seller-administration.spec.ts
```

Backend dùng PostgreSQL PGlite thực thi query, trigger và RLS; transport của Supabase được mô phỏng để kiểm tra định tuyến, quyền truy cập, rollback và payload. Playwright chạy frontend production build trên Chromium desktop/mobile, mock API và WebSocket để kiểm tra popup, mở đơn, chống trùng, hàng chờ nhiều trang, đánh dấu đã đọc, đăng xuất và polling dự phòng.

Kết quả đã kiểm chứng: backend 67/67, deployment contracts 12/12, production build và TypeScript e2e đạt. 40 ca Playwright seller hiện có đạt; 18 ca popup desktop/mobile đạt trong lượt cuối (1,2 phút). Một ca setup trước đó giả định subscription luôn tạo hai HTTP request; đã sửa để chủ động yêu cầu snapshot, phù hợp với cơ chế gộp request của React Query. Lint không có lỗi; còn các cảnh báo có sẵn ngoài phần thông báo.

## Kết nối thật và trạng thái triển khai

Ngày 12/10/2026: đã áp dụng SQL transport lên Supabase `htmramdkoevxzjqcpesb` bằng migration `seller_order_notifications_realtime`. Đã xác minh trigger hoạt động, policy private tồn tại, anon không gọi được helper và browser không gọi được hàm publish. Security advisor không báo lỗi của phần thông báo.

Probe [seller-notifications-realtime-probe.mjs](../backend/scripts/seller-notifications-realtime-probe.mjs) đã kiểm tra Supabase Auth, database và WebSocket thật với đúng sự kiện `changed`: nhận thông báo sau INSERT và từ chối topic seller khác. Một lần kiểm tra đầu tiên chưa nhận được sự kiện trong 15 giây; hai lần kiểm tra kế tiếp nhận được, gồm lần dùng chính xác bộ lọc của frontend. Polling vẫn là đường dự phòng khi sự kiện bị mất.

Probe chỉ tạo tài khoản, profile và thông báo tạm của riêng lượt thử, không tạo đơn hoặc thay đổi kho/cấu hình shop. Đã kiểm tra lại DB: 0 tài khoản Auth, 0 profile, 0 thông báo thử còn lại. Chạy lại bằng `node backend/scripts/seller-notifications-realtime-probe.mjs --live` từ root, với env local hiện có.

Chưa deploy frontend/backend mới lên Vercel. Cấu hình database và kiểm thử local/live transport không đồng nghĩa với việc website đã được cập nhật; phải deploy code mới để popup xuất hiện trên website đang hosting.
