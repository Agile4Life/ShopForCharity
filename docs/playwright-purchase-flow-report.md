# Kiểm tra Playwright: sản phẩm → gian hàng → mua → thanh toán

Ngày kiểm tra: **10/10/2026**, múi giờ Asia/Bangkok.

**Kết quả: 15/15 bước tuần tự PASS; không có response API lỗi trong luồng tích hợp cuối cùng.**

## Môi trường và phạm vi

- Frontend local: `http://127.0.0.1:5173`; backend local: `http://127.0.0.1:8080`.
- Chromium desktop, hai browser context tách biệt cho seller và khách mua.
- Đăng nhập qua Supabase Auth thật; upload, tải ảnh và cấp URL QR qua Supabase Storage thật.
- Backend dùng controller/service, xử lý ảnh và SQL của ứng dụng. Không intercept hoặc mock response HTTP trong test tích hợp.
- DB PostgreSQL WASM/PGlite riêng, tạo mới mỗi lần chạy. Profile SELLER được seed vào DB kiểm thử theo auth user đã đăng nhập. Không kết nối DATABASE_URL production để chạy luồng này.
- Ngân hàng, QR và số tiền là dữ liệu kiểm thử; không chuyển tiền thật và không tạo doanh thu giả trong DB production.
- Website `https://maiamchoem.vercel.app` trả HTTP 404 tại `/`, `/api/v1/health` và `/api/v1/shop` khi kiểm tra đầu phiên. Chưa xác nhận được hành trình trên bản deploy.

## Các bước đã chạy từng cái một

| Bước | Thao tác và điều kiện xác nhận | Kết quả |
| --- | --- | --- |
| 01 | Đăng nhập seller thật, mở dashboard có quyền SELLER | PASS |
| 02 | Tạo điểm nhận hàng qua form; điểm nhận xuất hiện trong danh sách | PASS |
| 03 | Upload ảnh QR; lưu ngân hàng kiểm thử và mở nhận đơn | PASS |
| 04 | Upload ảnh sản phẩm; tạo bản nháp giá 12.000đ, tồn 8; khách chưa thấy bản nháp | PASS |
| 05 | Mở bán; tab khách đang mở tự hiện sản phẩm; ảnh tải và giải mã thành công | PASS |
| 06 | Sửa giá 12.000đ → 15.000đ; tab khách tự cập nhật, không reload | PASS |
| 07 | Mở chi tiết; thêm 2 món vào giỏ; tổng 30.000đ; reload vẫn giữ giỏ | PASS |
| 08 | Đặt đơn BANK_TRANSFER; UNPAID; giữ 2 món; xóa giỏ; chưa cho báo chuyển trước accept | PASS |
| 09 | Seller thấy đúng đơn; ghi nhận liên hệ thành công; chấp nhận điểm/thời gian nhận | PASS |
| 10 | Khách thấy hướng dẫn và QR tải được; báo chuyển chỉ tạo REPORTED, receivedAmount vẫn 0 | PASS |
| 11 | Chuyển PREPARING → READY; nút hoàn tất bị khóa khi chưa PAID | PASS |
| 12 | Seller xác nhận khoản nhận mô phỏng 30.000đ; khách tự thấy PAID | PASS |
| 13 | Hoàn tất bàn giao; khách tự thấy COMPLETED; tồn 6, đang giữ 0 | PASS |
| 14 | Mua 1 món bằng CASH, đối soát mô phỏng 15.000đ và hoàn tất; tồn 5, đang giữ 0 | PASS |
| 15 | Seller ẩn sản phẩm; tab khách tự gỡ sản phẩm; DB ghi ARCHIVED | PASS |

Ở lần chạy cuối, bước mở bán mất khoảng 12,93 giây; bước sửa giá mất khoảng 14,85 giây; bước ẩn mất khoảng 15,64 giây. Đây là thời gian toàn bước gồm thao tác, chờ giao diện và chụp ảnh, phù hợp chu kỳ polling catalog 15 giây.

## Đối chiếu DB cuối cùng

| Đơn kiểm thử | Phương thức | Tổng / thực nhận mô phỏng | Thanh toán | Đơn hàng |
| --- | --- | --- | --- | --- |
| ORD-F65111CAB13469EF | BANK_TRANSFER | 30.000đ / 30.000đ | PAID | COMPLETED |
| ORD-406F90533D5A6966 | CASH | 15.000đ / 15.000đ | PAID | COMPLETED |

Sản phẩm cuối cùng: giá 15.000đ, trạng thái ARCHIVED, stock_on_hand = 5, stock_reserved = 0. Có payment event và audit log cho tạo đơn, xác nhận, giữ/tiêu thụ tồn và hoàn tất.

## Lỗi phát hiện và đã sửa

1. **Đọc lại cấu hình shop ngoài transaction cập nhật:** `ShopService.update()` gọi `get()` qua pool khác, không đọc được dữ liệu chưa commit của chính nó và bị treo với DB một kết nối. Đã truyền cùng transaction client vào các truy vấn shop, điểm nhận và cấu hình ngân hàng. Test bước 03 xác nhận response mới có acceptingOrders = true.
2. **Đơn CASH vẫn gọi hướng dẫn BANK_TRANSFER:** trang tra cứu guest và trang chi tiết customer gọi `/payment-instructions` dù thanh toán tiền mặt, nhận HTTP 409 `NO_BANK_INSTRUCTIONS`. Đã chỉ bật query sau khi đọc đơn và xác nhận paymentMethod = BANK_TRANSFER. Test tích hợp cuối cùng không còn response lỗi này; có test hồi quy cho cả guest/customer trên desktop/mobile.

Frontend build, TypeScript của test và 29 test backend đều thành công. Bộ kiểm tra auth/orders hiện có cũng ghi nhận 30 test case PASS trên desktop/mobile; runner local của lượt đó bị treo khi dọn web server và được dừng sau khi các case hoàn thành. Lượt hồi quy riêng cho hướng dẫn thanh toán tiền mặt sau đó kết thúc bình thường: **4/4 PASS**, exit code 0, cho guest/customer trên desktop/mobile.

## Bằng chứng và dọn dữ liệu

- [Kết quả JSON của 15 bước](../.tools/playwright-purchase-flow/flow-result.json).
- [Gian hàng đã cập nhật giá](../.tools/playwright-purchase-flow/06.png).
- [Khách thấy thanh toán chuyển khoản thành công](../.tools/playwright-purchase-flow/12.png).
- [Hoàn tất đơn chuyển khoản](../.tools/playwright-purchase-flow/13.png).
- [Hoàn tất đơn tiền mặt](../.tools/playwright-purchase-flow/14.png).
- [Sản phẩm đã biến mất khỏi gian hàng](../.tools/playwright-purchase-flow/15.png).

Các artifact trên lưu cục bộ trong thư mục `.tools/` được Git bỏ qua. Khóa tra cứu guest được che trong ảnh bước kiểm thử. Ba object Supabase của lần chạy thành công (QR, ảnh sản phẩm, thumbnail) đã được xóa. QR của lần chạy bị dừng trước đó cũng đã được xóa sau khi xác minh hash nội dung đúng fixture. Không xóa ảnh có sẵn khác.

## Chạy lại

Cần dependencies frontend/backend, Chromium Playwright trong `frontend/.browsers`, và các file cấu hình local đã tạo. Trong PowerShell tại `frontend/`, thiết lập email và mật khẩu seller bằng biến môi trường riêng, không đưa vào mã nguồn:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.browsers'
$env:E2E_SELLER_EMAIL = '<email seller>'
$env:E2E_SELLER_PASSWORD = '<password seller>'
$env:E2E_HARNESS_KEY = [guid]::NewGuid().ToString()
npm.cmd run test:e2e:integration
```

Runner dùng một worker và thực hiện lần lượt 15 `test.step`. Dừng server đang dùng cổng 8080/5173 trước khi chạy. Kết quả lần sau nằm trong `frontend/.tools/playwright-integration`; báo cáo HTML ở `frontend/playwright-report/integrated`.

Test này kiểm tra chức năng trên Chromium desktop và PostgreSQL WASM một kết nối. Không thay thế việc kiểm tra concurrency với PostgreSQL production, quét mã QR thật, đối soát tiền thật hoặc smoke test trên bản deploy.
