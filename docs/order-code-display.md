# Mã đơn trong thông báo — 12/10/2026

Bảng “Thông báo mới” dùng mã đơn làm tiêu đề thay cho “Tạo đơn hàng”. Tên khách và tổng tiền nằm bên dưới; nút mở đơn, sao chép mã và đánh dấu đã đọc vẫn hoạt động. Khi thông báo không có mã, hiển thị tên cập nhật phù hợp, không dùng UUID làm mã đơn.

Đơn mới do backend Node tạo có mã `ORD-` + 8 ký tự, ví dụ `ORD-8K3M7P2Q`. Giao diện chia phần mã thành hai nhóm 4 ký tự. Bộ ký tự loại bỏ `0`, `1`, `I`, `O`; mỗi mã có 40 bit ngẫu nhiên. Checkout giữ khóa shop khi kiểm tra trùng mã; thử lại tối đa 5 lần và vẫn dùng ràng buộc unique hiện có của DB. Trường hợp không cấp được mã trả lỗi trước khi lưu đơn/giữ hàng.

Mã đơn cũ giữ nguyên giá trị, hiển thị thành nhóm 4 ký tự. Sao chép dùng mã đầy đủ gốc; tìm đơn chấp nhận chữ thường và khoảng trắng giữa các nhóm. Không thay mã cũ trong dữ liệu, nội dung chuyển khoản hoặc email; không cần migration cho thay đổi định dạng này.

Kiểm chứng local: **73/73 test backend + 12/12 test cấu hình triển khai**, frontend build/typecheck đạt, lint không có lỗi; **64/64 Playwright Chromium desktop/Pixel 7 đạt**, gồm viewport 320px, mã ngắn/mã cũ, sao chép, đánh dấu đã đọc, mở/tìm đơn, tra cứu guest, thanh toán và thông báo popup. Test backend gồm retry khi trùng mã, hết retry trả lỗi và tạo/tra cứu mã mới trên PostgreSQL nhúng. Playwright dùng API fixture và Chromium revision 1243 có sẵn qua `.tools/order-codes/playwright.local.config.ts`; báo cáo ở `.tools/order-codes/playwright.xml`. Chưa deploy hoặc đổi dữ liệu thật trong lượt này.
