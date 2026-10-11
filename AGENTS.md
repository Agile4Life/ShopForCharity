# Quy trình kiểm thử

- Sau khi hoàn tất mỗi thay đổi, tự động chạy các kiểm thử phù hợp trước khi báo xong; không chờ người dùng nhắc hoặc xác nhận để chạy test.
- Với thay đổi backend Node hoặc cấu hình triển khai, chạy `npm.cmd test` từ root repository (trên Linux dùng `npm test`). Lệnh này gồm kiểm thử backend và cấu hình triển khai.
- Với thay đổi frontend, chạy `npm.cmd --prefix frontend run build` và các bài kiểm thử liên quan đến luồng đã thay đổi. Khi thay đổi tương tác người dùng, chạy bài Playwright tương ứng.
- Nếu kiểm thử phát hiện lỗi do thay đổi vừa làm, sửa và kiểm thử lại. Báo rõ kết quả đã kiểm chứng và các phần chưa thể kiểm chứng do thiếu cấu hình hoặc dịch vụ.
- Phân biệt chạy kiểm thử local với triển khai Preview; chỉ báo đã triển khai khi có deployment thành công và đã kiểm tra URL đó.
