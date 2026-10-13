# 🌼 Gói Ấm Trao Em · Frontend

Giao diện gian hàng gây quỹ với React 19, TypeScript và Vite 8. Thiết kế dùng nền giấy kem, mực xanh rừng, điểm nhấn cam đất và minh họa thủ công.

<img src="../docs/readme/images/desktop-home.png" alt="Trang chủ Gói Ấm Trao Em với nền giấy kem và minh họa thủ công" width="100%" />

Xem **[README chính: ảnh desktop/mobile, thiết kế UI/UX và hướng dẫn chạy](../README.md)**. Ảnh sử dụng dữ liệu kiểm thử cô lập.

## Phát triển

Tại root repository:

```powershell
npm.cmd --prefix frontend ci --workspaces=false
Copy-Item frontend/.env.example frontend/.env.local
npm.cmd run dev:frontend
```

Giữ file môi trường hiện tại nếu đã cấu hình. Điền Supabase URL và publishable key trong `.env.local`; Vite phục vụ tại `http://localhost:5173` và proxy `/api` đến backend ở `http://localhost:8080`. Cấu hình đầy đủ nằm trong [hướng dẫn chạy local](../README.md#chay-local).

## Các phần chính

| Đường dẫn | Nội dung |
| --- | --- |
| `src/features/catalog/` | Trang chủ, danh mục, chi tiết sản phẩm và combo |
| `src/features/cart/`, `src/features/checkout/` | Giỏ hàng, đặt hàng, xác nhận |
| `src/features/orders/` | Lịch sử và tra cứu đơn |
| `src/features/auth/` | Tài khoản khách hàng và người bán |
| `src/features/seller/`, `src/features/chat/` | Quản lý shop và hộp thư |
| `src/components/` | Thành phần dùng chung, minh họa, điều hướng, trạng thái |
| `src/workshop.css` | Token màu, font, phong cách và chuyển động |
| `src/responsive.css`, `src/usability.css` | Bố cục responsive và tương tác |
| `e2e/` | Playwright và API/session fixture |
| `scripts/readme/` | Bộ chụp ảnh giao diện cho README |

Tham khảo [design system](../design-system/shop-for-charity/MASTER.md) và [UX](../design-system/shop-for-charity/UX.md) trước khi thay đổi giao diện.

## Kiểm chứng

Tại root repository:

```powershell
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run test:e2e
```

Playwright tự build và chạy preview local bằng dữ liệu mẫu. Browser cần được cài trước khi chạy. Cách chụp lại ảnh được mô tả trong [README chính](../README.md#kiem-thu). Linux/macOS dùng `npm` thay cho `npm.cmd`.
