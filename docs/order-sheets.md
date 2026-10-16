# Đồng bộ một chiều: web → Google Sheets

Backend chỉ xuất đơn đã xác nhận từ web sang Sheet. Mỗi đơn được xuất một lần
cho từng spreadsheet/tab. Sau đó, bạn có thể sửa tay mọi cột A:J, nhập thêm đơn
trên Sheet hoặc di chuyển dòng; web không ghi lại dòng đã xuất. Sửa Sheet không
cập nhật đơn, thanh toán hay tồn kho trong app.

Bảng giữ nguyên 10 cột. Không cần Apps Script, webhook hoặc secret đồng bộ ngược.
Backend ghi nhận đơn đã xuất trong bảng riêng `shop.order_sheet_exports` trên
PostgreSQL, không thêm cột và không tạo/cập nhật metadata Google. Metadata cũ chỉ
được đọc để nhận diện các đơn đã xuất trước nâng cấp.

Đơn mới được chèn trước dòng TỔNG CỘNG. Ba ô D:F của dòng tổng dùng công thức
Google Sheets, tự cập nhật số lượng và tổng tiền khi nhập thêm, sửa hoặc xóa đơn
thủ công, kể cả đơn bên dưới dòng tổng. Công thức bỏ qua đơn có trạng thái
`Đã hủy đơn` và dòng tổng. Nhập D:F bằng giá trị số (có thể định dạng tiền tệ),
không nhập chuỗi văn bản như `35.000đ`. Giữ công thức ở ba ô tổng D:F khi sửa Sheet.

Sheet cũ được đổi tổng tĩnh sang công thức khi backend xuất đơn mới hoặc khi chạy
`syncAllConfirmedOrders()`, kể cả khi mọi đơn web đã xuất từ trước. Chỉ ba ô tổng
D:F được cập nhật; các ô khác của dòng tổng và dữ liệu đơn đã xuất được giữ nguyên.
Sau khi triển khai bản sửa, cần thực hiện một trong hai thao tác này một lần cho
Sheet cũ; từ đó thao tác nhập tay không cần gọi backend để tính lại tổng.

Có thể chạy đồng bộ một lần từ root repository với cấu hình backend đã sẵn sàng
(bao gồm migration V11 và quyền truy cập Google Sheets):

```powershell
node --input-type=module -e "import { getOrderSheetsService } from './backend/src/infrastructure/order-sheets-service.js'; import { pool } from './backend/src/common/db.js'; try { console.log(await getOrderSheetsService().syncAllConfirmedOrders()); } finally { await pool.end(); }"
```

Lệnh này cũng xuất các đơn đã xác nhận chưa có biên nhận, như luồng đồng bộ thông thường.

## Áp dụng

- Chạy migration V11 bằng tài khoản migration trước khi triển khai backend mới.
- Giữ bốn biến backend: GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_TAB_NAME,
  GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
- Chia sẻ Sheet cho Service Account với quyền chỉnh sửa.
- GOOGLE_SHEETS_WEBHOOK_SECRET không còn được sử dụng và có thể xóa khỏi Vercel.
- Triển khai phiên bản mới để endpoint `/api/v1/integrations/sheets/sync` bị gỡ.
- Trong Apps Script → Trình kích hoạt, xóa các trigger handleOrderSheetEdit,
  handleOrderSheetChange và reconcileOrderSheet. Các trigger cũ không thể cập nhật
  app qua endpoint sau khi phiên bản mới được triển khai.

Đơn đã có biên nhận xuất sẽ không được xuất lại, kể cả khi bạn xóa dòng trên Sheet.
Khi đổi tên tab hoặc đổi spreadsheet, backend coi đó là đích xuất mới.

## Dữ liệu cũ và giới hạn

Nếu đơn chưa có biên nhận và không có metadata cũ, backend đối chiếu tên khách,
điện thoại, số lượng và tổng tiền để nhận diện dòng cũ, giữ nguyên ghi chú và các
ô đã sửa. Dòng đã sửa các trường đối chiếu trước khi nâng cấp có thể không nhận
diện được và bị thêm trùng. Không sửa dữ liệu cũ trong lúc chuyển đổi.

Biên nhận được lưu sau khi Google xác nhận ghi thành công. Nếu Google đã ghi xong
nhưng database lỗi khi lưu biên nhận, lần thử tiếp theo đối chiếu dòng cũ để khôi
phục. Nếu dòng đó bị sửa trước lần thử lại, đối chiếu có thể không thành công.
Các lần xuất trong cùng service được xếp hàng; nhiều backend instance và thao tác
chèn/xóa dòng đồng thời trên Sheet chưa được khóa chung.

Migration V10 đã áp dụng trước đó được giữ trong lịch sử; không chạy rollback làm
mất đơn hoặc sửa dữ liệu kinh doanh đã tồn tại.
