# Kiểm tra loading và thông báo lỗi

Ngày kiểm tra: 10/10/2026. Các thay đổi nằm trong mã local; chưa deploy lên Vercel.

## Hành vi đã sửa

- API, đăng nhập và tải nội dung phản hồi có giới hạn mặc định 15 giây. Yêu cầu đang chạy hiện chỉ báo sau 500 ms; sau 8 giây hiện thông báo phản hồi chậm. Mất mạng có thông báo riêng.
- Tải mã JavaScript của trang cũng có giới hạn 15 giây; thiếu bundle hoặc mạng treo chuyển sang thông báo tải lại trang, không để Suspense loading vô hạn.
- Lỗi được đổi thành hướng dẫn tiếng Việt. Giao diện không hiển thị SQL, stack trace, mã lỗi nội bộ, chi tiết lỗi hoặc request ID. Trường hợp không nhận diện được dùng thông báo an toàn.
- Các thao tác lưu, thêm vào giỏ, xử lý đơn, báo chuyển khoản, đối soát và upload có trạng thái đang xử lý. Form trong modal bị khóa khi lưu; không đóng bằng Escape hoặc bấm nền trong lúc xử lý.
- Khi lỗi, form giữ nội dung đã nhập và cho phép thử lại. Lỗi tải danh mục, thành phần combo, hồ sơ hoặc hướng dẫn thanh toán có nút thử lại; lỗi hồ sơ không bị hiểu nhầm là thiếu quyền seller.
- Lỗi tải lại ở nền giữ dữ liệu đã nhận trước đó. Kết quả lưu đơn được đưa vào cache ngay, nên báo chuyển khoản thành công vẫn hiển thị đúng khi lượt đọc tiếp theo bị lỗi.
- Thêm vào giỏ kiểm tra lại giá và tồn kho; lỗi đọc/lưu giỏ trên máy có thông báo. Giỏ trong bộ nhớ vẫn dùng được khi trình duyệt không cho ghi localStorage.
- Ảnh sản phẩm/ảnh xem trước/QR lỗi hoặc tải quá lâu có thông báo thay thế. QR cho phép tải lại hướng dẫn để lấy URL mới. Thời hạn ảnh lazy bắt đầu khi ảnh vào viewport.
- Sao chép thông tin tra cứu bị từ chối, thiếu clipboard hoặc chờ quyền quá lâu có thông báo và hướng dẫn tải về máy; nút không bị kẹt.
- Sao chép bằng clipboard vẫn hoạt động khi offline nếu trình duyệt hỗ trợ; việc mất mạng không chặn thao tác cục bộ này.
- Shop đóng trong lúc đặt hàng được thông báo đúng nguyên nhân; giỏ được giữ lại. Thiếu liên hệ thành công được báo ngay khi bấm chấp nhận đơn.

## Tránh gửi lặp và mất giỏ

Các yêu cầu JSON ghi dữ liệu giống nhau đang chờ được dùng chung một promise. Yêu cầu thất bại giữ Idempotency-Key trong 10 phút để lần thử lại cùng nội dung trong tab hiện tại dùng cùng mã. Các thao tác ghi không được tự động retry.

API trả HTTP 200 nhưng phản hồi tạo đơn thiếu ID/mã đơn/tổng tiền vẫn được xem là chưa xác nhận được kết quả: không xóa giỏ, không chuyển sang trang thành công, giữ mã yêu cầu để thử lại. Báo giá và kết quả upload cũng được kiểm tra trước khi cập nhật giao diện.

Timeout không khẳng định thao tác trên server đã thất bại. Người dùng được nhắc kiểm tra dữ liệu/trạng thái đơn trước khi thử lại. Mã yêu cầu lưu trong bộ nhớ của tab, không tồn tại qua reload. Upload FormData được khóa bằng trạng thái form; không dùng cơ chế gộp request JSON.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Build production TypeScript + Vite | PASS |
| TypeScript cho Playwright | PASS |
| Playwright toàn bộ, Chromium desktop và Pixel 7 | 200/200 PASS |
| Các tình huống lỗi mới | 32 tình huống × 2 viewport = 64 kiểm tra PASS |
| Luật chuyển trạng thái đơn backend | 5/5 PASS |
| Flow tích hợp thêm sản phẩm → mua → chuyển khoản/tiền mặt → bàn giao | 15/15 bước PASS, không có response API lỗi |
| Lint | Không có lỗi; còn các cảnh báo React/Fast Refresh |

Các kiểm tra lỗi mới bao gồm mất mạng, timeout đọc/ghi, bấm lặp, lỗi 403/409/429/500/503, dữ liệu tải lại thất bại, phản hồi HTML/JSON thiếu dữ liệu, lỗi ảnh/upload/QR, clipboard và localStorage.

Các test trình duyệt dùng request fixture riêng từng test. Luồng tích hợp dùng controller/service/SQL thật với DB PGlite riêng, Supabase Auth/Storage thật và dọn ảnh kiểm thử. Không tạo đơn, đối soát tiền hoặc đổi cấu hình shop trong DB production.

Luồng tích hợp cuối đã qua 15 bước, có 0 response API lỗi và dọn 3 object ảnh kiểm thử trên Supabase. Test đưa tab của bước hiện tại lên foreground trước khi thao tác để tránh chờ input khi chuyển giữa hai phiên seller/khách.
