# Thanh toán chuyển khoản trước khi shop xác nhận đơn

- Chọn **Chuyển khoản** ở checkout để xem ngân hàng, số tài khoản, chủ tài khoản và tổng tiền. Thông tin lấy từ tài khoản shop đã cấu hình, không dùng dữ liệu mẫu.
- Tạo đơn trước khi chuyển để có mã đơn làm nội dung giao dịch. Trang đặt hàng thành công hiển thị tài khoản, số tiền, nội dung chuyển khoản và QR nếu có.
- Khách vãng lai và khách đăng nhập nhấn **Tôi đã chuyển khoản** ngay khi đơn đang chờ shop xác nhận. Trang chi tiết/tra cứu đơn cũng hỗ trợ thao tác này.
- Báo chuyển chỉ đổi `UNPAID` thành `REPORTED`, giữ đơn ở `PENDING_CONTACT` và không tăng số tiền đã nhận. Shop nhận thông báo để kiểm tra giao dịch, xác nhận tiền rồi liên hệ/xác nhận đơn bằng các thao tác quản lý hiện có.
- Đơn đã hủy/từ chối/hết hạn/hoàn tất và đơn tiền mặt không được báo chuyển. Quyền sở hữu đơn, phiên khách, phiên bản và khóa chống gửi trùng vẫn được kiểm tra.

`POST /checkout/quote` bổ sung `bankTransfer: { bankName, accountNumber, accountHolder }` cho chuyển khoản, `null` cho tiền mặt. Shop chưa cấu hình ngân hàng trả `BANK_NOT_CONFIGURED`.

`GET /{me|guest}/orders/{id|code}/payment-instructions` tiếp tục dùng phiên bản tài khoản lưu với đơn, trả `waitForAcceptance: false`. API báo chuyển chấp nhận `PENDING_CONTACT`, `ACCEPTED`, `PREPARING`, `READY` khi chưa thanh toán; chỉ shop được xác nhận `PAID`.

Kiểm thử nghiệp vụ: `backend/tests/bank-transfer-checkout.test.js`. Kiểm thử desktop/mobile: `frontend/e2e/payment-instructions.spec.ts`, cùng các luồng checkout, tra cứu và phục hồi lỗi hiện có.
