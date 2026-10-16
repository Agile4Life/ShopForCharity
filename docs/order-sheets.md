# Đồng bộ đơn hàng Google Sheets ↔ app

Bảng giữ nguyên 10 cột A:J. Backend xuất đơn đã xác nhận một lần; web không ghi đè
các dòng đã xuất. Sau khi cài Apps Script, bạn có thể nhập đơn mới hoặc sửa ô trên
Sheet để cập nhật ngược về app.

| Cột | Điều kiện nhập từ Sheet |
| --- | --- |
| A — Khách hàng | Bắt buộc |
| B — Số điện thoại | Bắt buộc; nhập dạng văn bản để giữ số 0 đầu |
| C — Địa chỉ nhận hàng | Bắt buộc; dùng trực tiếp địa chỉ nhập tay |
| D — Hoa Kẽm Nhung | Số nguyên không âm; để trống tương đương 0 |
| E — Bánh tráng chấm | Số nguyên không âm; để trống tương đương 0 |
| F — Tổng tiền thanh toán | Số nguyên dương; nhập số rồi dùng định dạng tiền tệ của Sheet |
| G — Phương thức thanh toán | Tiền mặt hoặc Chuyển khoản QR / Chuyển khoản |
| H — Trạng thái thanh toán | Chưa thanh toán, Chưa thanh toán (Đã báo CK), Đã thanh toán, Chờ hoàn tiền, Đã hoàn tiền, hoặc Đã hủy đơn |
| I — Người giới thiệu | Không bắt buộc; không cần thuộc danh sách trên web |
| J — Ghi chú | Bắt buộc; có thể nhập Không có |

Chỉ cần D hoặc E lớn hơn 0. Không cần điền cả hai loại hàng. Backend hỗ trợ hai
loại hàng tương ứng hai cột hiện có; không tự thêm cột. Danh mục app cần có đúng
một sản phẩm mang tên tương ứng cho mỗi loại hàng được nhập.

Chèn dòng trước TỔNG CỘNG rồi nhập dữ liệu. Dòng chưa đủ thông tin không tạo đơn
dở dang và không xóa dữ liệu cũ trong app. Khi đủ dữ liệu, trigger gửi mã dòng về
backend; backend tự đọc giá trị hiện tại từ Google Sheets. Đơn nhập tay được tạo
với trạng thái ACCEPTED; không cần email, tài khoản khách, điểm nhận có sẵn hoặc
người giới thiệu có sẵn.

Quy tắc dữ liệu app vẫn được giữ: tồn kho không âm; số lượng trong giới hạn integer;
tổng tiền trong giới hạn numeric của database; đơn COMPLETED phải PAID. Nếu lỗi,
toàn bộ cập nhật đơn/thanh toán/tồn kho được rollback. Tổng tiền Sheet được phân bổ
vào giá dòng hàng theo tỷ trọng giá danh mục để tổng các dòng bằng tổng đơn. Một
sản phẩm có thể tách hai dòng giá để làm tròn đồng, giữ đúng số lượng. Tổng tiền
tối thiểu 1 đồng/món. Sửa số lượng cập nhật tồn kho giữ hàng hoặc đã tiêu thụ.

Đã thanh toán ghi nhận đã nhận đủ tổng đơn. Đã hủy đơn hủy đơn và giải phóng/hoàn
lại tồn kho; chỉ dùng khi việc hủy/hoàn hàng đã được xử lý. Xóa dòng Sheet không tự
xóa đơn app. Các trạng thái PREPARING/READY/COMPLETED vẫn quản lý trên app.

## Kích hoạt

1. Chạy migration V10 bằng tài khoản migration, từ root:
   `npm.cmd --prefix backend run migrate`. Với database Flyway cũ chưa baseline,
   dùng quy trình `migrate:upgrade-node` hiện có.
2. Cấu hình backend với các biến Google Sheets hiện có và biến mới
   `GOOGLE_SHEETS_WEBHOOK_SECRET`: chuỗi ngẫu nhiên riêng, ít nhất 32 ký tự.
   Có thể tạo bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
   Giữ secret trong môi trường backend; không dùng biến VITE hoặc mã nguồn frontend.
3. Triển khai backend. Endpoint cần truy cập qua HTTPS tại
   `/api/v1/integrations/sheets/sync`. Cấu hình local chưa làm Sheet thật tự đồng bộ.
4. Mở đúng Sheet → Extensions → Apps Script. Chép
   [Code.gs](../integrations/google-sheets/Code.gs) vào project gắn với bảng tính.
5. Trong Project Settings bật hiển thị manifest, chép
   [appsscript.json](../integrations/google-sheets/appsscript.json). Bật advanced
   service Google Sheets API v4; nếu dùng Cloud project riêng, bật cả Google Sheets API ở Cloud Console.
6. Thêm Script Properties:
   - `BACKEND_SYNC_URL`: URL HTTPS đầy đủ, ví dụ `https://your-app.example/api/v1/integrations/sheets/sync`.
   - `SYNC_SECRET`: cùng giá trị với GOOGLE_SHEETS_WEBHOOK_SECRET của backend.
   - `SHEET_TAB_NAME`: đúng tên tab trong GOOGLE_SHEETS_TAB_NAME; bỏ trống cả hai để dùng tab đầu.
7. Chạy `installOrderSheetSync` một lần và cấp quyền bằng tài khoản được sửa Sheet.
   Hàm liên kết đơn cũ, tạo trigger sửa ô/thay đổi cấu trúc và thử lại mỗi phút, rồi
   đồng bộ các dòng hiện có. Chạy lại sẽ thay trigger cũ cùng tên của tài khoản đó.
   Chỉ một tài khoản nên cài trigger.
8. Kiểm tra bằng đơn thử: chỉ nhập D hoặc E, bỏ trống I, điền đủ các cột khác.
   Kiểm tra đơn trên app; sửa ghi chú/thanh toán để kiểm tra cập nhật đúng đơn,
   không tạo trùng. Xóa J: app phải giữ nguyên đến khi nhập đủ.

Trigger gửi thay đổi khi sửa ô; lịch mỗi phút thử lại dòng lỗi hoặc thay đổi bị bỏ
lỡ. Dòng thành công được ghi nhớ bằng hash trong Script Properties. Lỗi nhập liệu
hiện toast cho lần sửa trực tiếp và ghi trong Apps Script → Executions. Lỗi kết
nối cũng nằm trong Executions và được thử lại. App nhận dữ liệu theo polling hiện có.

Backend đọc metadata một lần và đọc giá trị các dòng theo lô (tối đa 25 mã/lô).
Kết quả được ghép theo metadata ID; không dựa vào thứ tự trả về từ Google. Khi
Google giới hạn yêu cầu, backend trả `503 SHEET_RATE_LIMITED`, kèm `Retry-After: 60`.
Lỗi quyền Google trả `502 SHEET_GOOGLE_ACCESS_DENIED`; lỗi đọc Google khác giữ mã
`GOOGLE_SHEETS_*` để dễ kiểm tra. Apps Script mới hiện mã lỗi và requestId trong
Executions. Sau khi nâng cấp backend, chép lại Code.gs mới vào Apps Script.

Nếu quá trình cài trigger đã đến bước reconcile nhưng lỗi tạm thời, chờ một phút
rồi chạy `reconcileOrderSheet` để thử lại. Không cần chạy bootstrap lại mỗi lần thử.

## Nhận diện dòng và dữ liệu cũ

Mã đơn nằm trong developer metadata gắn với dòng, không có cột phụ. Không sao chép
hoặc sửa metadata để nhân bản đơn; hãy chèn dòng mới rồi nhập ô A:J. Sắp xếp/di
chuyển cả dòng để giữ liên kết. Không xóa metadata của dòng đã liên kết.

Bootstrap đối chiếu đơn cũ theo tên khách, điện thoại, số lượng và tổng tiền rồi
chỉ thêm metadata. Nếu các trường này đã bị sửa trước nâng cấp, không thể tự xác
định chính xác đơn cũ; cần liên kết metadata với đúng UUID đơn trong database trước
khi bật trigger để tránh thêm trùng.

Dòng TỔNG CỘNG và dòng trống không nhập vào app. Tổng trên Sheet hiện được backend
tính lại khi xuất thêm đơn từ web; sửa tay không tự tính lại tổng tĩnh. Có thể
thay tổng tĩnh bằng công thức Sheet nếu cần cập nhật ngay khi nhập. Web không cập
nhật dòng đã xuất, kể cả thay đổi thanh toán; sửa tiếp trên Sheet cập nhật các
trường có trong Sheet về app.

Kiểm thử local dùng PostgreSQL nhúng, HTTP controller thật, mock Google Sheets và
mô phỏng Apps Script. Vẫn cần cài trigger/cấp quyền và kiểm tra trên Sheet thật.
