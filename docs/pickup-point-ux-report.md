# Sửa form điểm nhận hàng — 10/10/2026

Đã tái hiện bằng Playwright: gõ `Cong thu vien truong` chỉ lưu ký tự `C`. `Modal` chạy lại effect focus mỗi khi callback `onClose` của trang cha thay đổi, làm ô nhập mất focus sau mỗi ký tự. Modal nằm trong trang có animation transform còn khiến form bị cắt đầu khi viewport thấp.

Đã sửa:

- Effect focus chỉ chạy khi mở/đóng modal, giữ callback mới nhất qua ref. Tự focus tên địa điểm, giữ focus khi gõ/sửa/xuống dòng, hỗ trợ Tab/Escape và không đóng khi đang ghép ký tự bằng IME.
- Render modal qua portal ra `document.body`, tránh vị trí bị ảnh hưởng bởi animation trang. Chiều rộng tối đa 560px, vừa màn hình nhỏ; phần nội dung cuộn được và nút hành động luôn dễ tiếp cận.
- Sửa label/ID trùng với upload QR; báo tên trống ngay trong form, trim dữ liệu khi lưu. Loading khóa nút/ô nhập, chặn gửi lặp và đóng form khi đang lưu; lỗi giữ nguyên dữ liệu để thử lại; thành công có thông báo.
- Làm gọn trang cài đặt, bổ sung trạng thái chưa có điểm nhận/loading/lỗi. Mobile đưa điểm nhận lên trước, hàng upload QR xuống dòng; chỉnh navbar để không tràn ở 360px.
- Tạo hoặc ẩn/mở điểm nhận làm mới cả danh sách seller và dữ liệu shop công khai.

Kiểm chứng: **38/38 Playwright desktop/mobile pass**, gồm 12 ca pickup và 26 ca hồi quy seller. Viewport **360×480** không tràn ngang/cắt modal. Test tích hợp riêng qua **Supabase Auth thật + backend thật + DB kiểm thử riêng** cũng pass: nhập, lưu, reload, ẩn/mở và kiểm tra điểm nhận trong `/shop`. Frontend build và typecheck pass; lint còn warning có sẵn, không có lỗi.

Ảnh: [desktop](../.tools/pickup-ux/desktop.png), [mobile](../.tools/pickup-ux/mobile.png), [360×480](../.tools/pickup-ux/small-viewport.png). [Kết quả Playwright](../.tools/pickup-ux/playwright.xml). Artifact bị Git ignore.

Thay đổi hiện ở local, chưa deploy trong lượt này. Không tạo điểm nhận hoặc bật nhận đơn trên shop thật.

```powershell
cd frontend
npm.cmd run test:e2e -- e2e/pickup-points.spec.ts e2e/seller-administration.spec.ts e2e/seller.spec.ts --workers=1
# Integration cần E2E_SELLER_EMAIL, E2E_SELLER_PASSWORD, E2E_HARNESS_KEY qua env:
npm.cmd run test:e2e:integration -- e2e-integrated/pickup-form.spec.ts
```
