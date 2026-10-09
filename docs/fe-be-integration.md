# Frontend - Backend Integration Contract Guide

Tài liệu này chuẩn hóa toàn bộ các giao tiếp HTTP giữa **Frontend (React)** và **Backend (Spring Boot)** theo đúng [spec.md](./spec.md) để Backend Agent có thể đối chiếu và triển khai tương thích 100%.

---

## 1. Nguyên tắc chung & Headers

- **Base URL:** `/api/v1`
- **Data format:** JSON `camelCase`, Enum `UPPER_SNAKE_CASE`, UUID string, thời gian ISO-8601 UTC (ví dụ: `2026-10-09T09:00:00Z`).
- **Tiền tệ:** Số nguyên VND (không dùng floating-point).
- **Credentials:**
  - FE luôn gửi `credentials: 'include'` trên mọi request để mang guest session cookie (`SameSite=Lax`, `HttpOnly`).
  - Khi đã đăng nhập qua Supabase Auth, FE gửi thêm header:  
    `Authorization: Bearer <supabase_access_token>`.
- **Chống submit trùng (Idempotency):**
  - Mọi request tạo mới / cập nhật trạng thái quan trọng (`POST /orders`, `POST /seller/orders/:id/*`, `POST /seller/products/:id/stock-adjustments`, v.v.) FE luôn tự động gửi header:  
    `Idempotency-Key: <uuid-v4>`.
- **Optimistic Locking (expectedVersion):**
  - Các mutation thay đổi trạng thái đơn, điều chỉnh tồn kho, sửa thông tin catalog gửi kèm `expectedVersion: number`. Nếu version không khớp, backend trả `409 Conflict`.
- **Chuẩn hóa lỗi (Error Response Format):**
  ```json
  {
    "code": "INSUFFICIENT_STOCK",
    "message": "Một số món không còn đủ số lượng. Vui lòng kiểm tra giỏ hàng.",
    "details": [
      { "field": "items", "catalogId": "uuid-here", "availableQuantity": 1 }
    ],
    "requestId": "uuid-request",
    "timestamp": "2026-10-09T09:00:00Z"
  }
  ```

---

## 2. Danh sách Endpoints & Contracts

### 2.1. Public & Catalog
- `GET /api/v1/shop`
  - Response: `{ id: string, name: string, contactPhone: string, contactEmail: string, acceptingOrders: boolean, pickupPoints: Array<{ id: string, name: string, instructions: string, active: boolean }> }`
- `GET /api/v1/categories`
  - Response: `Array<{ id: string, code: string, name: string, active: boolean }>`
- `GET /api/v1/products?q=&category=&sort=&page=&size=`
  - Response: `{ content: Array<ProductSummary>, page: number, size: number, totalElements: number, totalPages: number }`
  - `ProductSummary`: `{ id: string, slug: string, name: string, description: string, price: number, imageUrl?: string, categoryId: string, categoryName: string, availableStock: number, isSoldOut: boolean, status: 'ACTIVE'|'DRAFT'|'ARCHIVED' }`
- `GET /api/v1/products/:id`
  - Response: `ProductDetail` (thêm `ingredients?: string`, `allergens?: string`, `preservationInstructions?: string`, `version: number`)
- `GET /api/v1/combos`
  - Response: `Array<ComboSummary>`
  - `ComboSummary`: `{ id: string, slug: string, name: string, description: string, price: number, imageUrl?: string, availableStock: number, isSoldOut: boolean, items: Array<{ productId: string, productName: string, quantity: number, availableStock: number }> }`
- `GET /api/v1/combos/:id`
  - Response: `ComboDetail` (chi tiết combo và thành phần)

### 2.2. Checkout & Đặt hàng
- `POST /api/v1/checkout/session`
  - Mục đích: Cấp guest session cookie trước khi tạo đơn (nếu chưa có).
  - Response: `{ sessionId: string }`
- `POST /api/v1/checkout/quote`
  - Body: `{ items: Array<{ kind: 'PRODUCT'|'COMBO', catalogId: string, quantity: number }> }`
  - Response: `{ quoteToken: string, expiresAt: string, subtotal: number, total: number, items: Array<{ kind: string, catalogId: string, name: string, unitPrice: number, quantity: number, lineTotal: number, availableStock: number, isAvailable: boolean }> }`
- `POST /api/v1/orders`
  - Header: `Idempotency-Key: <uuid>`, `Authorization: Bearer <token>` (tùy chọn nếu đã đăng nhập)
  - Body:
    ```json
    {
      "quoteToken": "string",
      "items": [
        { "kind": "PRODUCT", "catalogId": "uuid", "quantity": 1 }
      ],
      "buyer": {
        "fullName": "Nguyễn Văn A",
        "phone": "0901234567",
        "email": "student@example.com",
        "className": "12A1"
      },
      "pickupPointId": "uuid",
      "requestedPickupAt": "2026-10-10T10:00:00Z",
      "paymentMethod": "CASH" | "BANK_TRANSFER",
      "note": "Ghi chú giao hàng"
    }
    ```
  - Response 201:
    ```json
    {
      "orderId": "uuid",
      "orderCode": "ORD-123456",
      "status": "PENDING_CONTACT",
      "paymentStatus": "UNPAID",
      "total": 50000,
      "reservationExpiresAt": "2026-10-10T09:00:00Z",
      "version": 0,
      "guestAccessToken": "random-token" // chỉ có với guest checkout
    }
    ```

### 2.3. Khách hàng (Account) & Guest
- `GET /api/v1/me` -> `{ id: string, authUserId: string, fullName: string, phone: string, email: string, role: 'CUSTOMER'|'SELLER', active: boolean }`
- `PATCH /api/v1/me` -> Body: `{ fullName?: string, phone?: string, email?: string }`
- `GET /api/v1/me/orders?page=0&size=20` -> Danh sách đơn của user
- `GET /api/v1/me/orders/:id` -> Chi tiết đơn của user
- `POST /api/v1/me/orders/:id/cancel` -> Body: `{ reason: string }`
- `POST /api/v1/me/orders/:id/payment-report` -> Báo đã chuyển khoản
- `GET /api/v1/me/orders/:id/payment-instructions` -> `{ bankName, accountNumber, accountHolder, amount, transferContent, qrSignedUrl }`
- `POST /api/v1/guest/orders/access` -> Body: `{ orderCode: string, guestToken: string }` (thiết lập session cookie cho guest)
- `GET /api/v1/guest/orders/:orderCode` -> Xem chi tiết đơn guest
- `POST /api/v1/guest/orders/:orderCode/cancel` -> Body: `{ reason: string }`
- `POST /api/v1/guest/orders/:orderCode/payment-report` -> Báo đã chuyển khoản
- `GET /api/v1/guest/orders/:orderCode/payment-instructions` -> QR và thông tin chuyển khoản

### 2.4. Người bán (Seller)
- `GET /api/v1/seller/dashboard` -> `{ pendingCount: number, readyCount: number, completedRevenue: number, pendingRevenue: number }`
- `GET /api/v1/seller/orders?status=&paymentStatus=&date=&orderCode=&page=&size=`
- `GET /api/v1/seller/orders/:id` -> Chi tiết đơn + contact attempts + timeline + payment events
- `POST /api/v1/seller/orders/:id/contact-attempts` -> Body: `{ channel: 'PHONE'|'EMAIL'|'IN_PERSON', outcome: 'SUCCESS'|'NO_RESPONSE'|'FAILED', note: string }`
- `POST /api/v1/seller/orders/:id/accept` -> Body: `{ confirmedPickupPointId: string, confirmedPickupAt: string, expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/reject` -> Body: `{ reason: string, expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/prepare` -> Body: `{ expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/ready` -> Body: `{ expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/complete` -> Body: `{ expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/cancel` -> Body: `{ reason: string, expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/confirm-payment` -> Body: `{ amount: number, bankReference?: string, note?: string, expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/dismiss-payment-report` -> Body: `{ reason: string, expectedVersion: number }`
- `POST /api/v1/seller/orders/:id/confirm-refund` -> Body: `{ bankReference?: string, note?: string, expectedVersion: number }`
- `GET /api/v1/seller/products?page=0&size=20` & `POST /api/v1/seller/products`
- `GET /api/v1/seller/products/:id` & `PATCH /api/v1/seller/products/:id`
- `POST /api/v1/seller/products/:id/archive` & `POST /api/v1/seller/products/:id/activate`
- `POST /api/v1/seller/products/:id/stock-adjustments` -> Body: `{ deltaOnHand: number, reason: string, expectedVersion: number }`
- `GET /api/v1/seller/combos` & `POST /api/v1/seller/combos`
- `GET /api/v1/seller/combos/:id` & `PATCH /api/v1/seller/combos/:id`
- `POST /api/v1/seller/combos/:id/archive` & `POST /api/v1/seller/combos/:id/activate`
- `POST /api/v1/seller/assets` -> multipart/form-data (file: File, type: 'PRODUCT_IMAGE'|'PAYMENT_QR') -> `{ assetId: string, objectPath: string, url: string }`
- `GET /api/v1/seller/shop-settings` & `PATCH /api/v1/seller/shop-settings`
- `GET /api/v1/seller/pickup-points`, `POST /api/v1/seller/pickup-points`, `PATCH /api/v1/seller/pickup-points/:id`
- `GET /api/v1/seller/notifications` & `POST /api/v1/seller/notifications/:id/read`
- `GET /api/v1/seller/audit-logs?action=&entityType=&date=&page=&size=`

---

## 3. Chu kỳ Polling của Frontend

Frontend sử dụng React Query tự động poll theo chu kỳ:
- **Public Catalog (Landing & Detail):** 15 giây
- **Seller Orders & Notifications:** 10 giây
- **Chi tiết đơn của Khách / Guest:** 10 giây
- **Seller Dashboard Summary:** 30 giây
