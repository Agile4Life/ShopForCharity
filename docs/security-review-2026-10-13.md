# Rà soát bảo mật ngày 13/10/2026

Phạm vi: xác thực và phân quyền API, đơn hàng khách hàng/khách vãng lai/người bán, bộ nhớ đệm frontend, cookie và CSRF, giới hạn tạo đơn, dữ liệu Supabase/Storage, tải ảnh, cấu hình triển khai và thư viện phụ thuộc. Đã sửa các lỗi tái hiện được trong mã nguồn và kiểm thử local. Chưa triển khai những thay đổi này lên Preview hoặc production; chưa thay đổi cấu hình Auth hay dữ liệu Supabase đang chạy.

## Các lỗi đã sửa

| Phát hiện | Ảnh hưởng | Bản sửa và kiểm chứng |
| --- | --- | --- |
| Cache chi tiết đơn không gắn với người dùng; đăng xuất không xóa cache | Khi A đăng xuất rồi B đăng nhập trong cùng trang, dữ liệu riêng của A có thể tiếp tục xuất hiện dù API từ chối B | Gắn query key với user ID; hủy/xóa cache và reset các yêu cầu ghi khi đổi tài khoản/đăng xuất. Playwright tái hiện việc chuyển tài khoản **không tải lại trang**, xác nhận B không còn thấy thông tin A. |
| Trang tra cứu vẫn hiển thị dữ liệu cache sau khi API báo hết phiên | Thông tin người mua vẫn hiện sau khi quyền truy cập khách vãng lai hết hạn | Trang chi tiết/tra cứu ẩn dữ liệu khi nhận 401/403/404, kể cả khi cache còn dữ liệu. Playwright xác nhận dữ liệu riêng biến mất sau 401. |
| Phản hồi tạo đơn đến muộn sau đăng xuất | Callback của phiên trước có thể mở lại trang kết quả đặt hàng | Các yêu cầu ghi JSON có thế hệ phiên; phản hồi từ thế hệ cũ bị từ chối trước callback thành công. Playwright giữ phản hồi tạo đơn, đăng xuất rồi trả phản hồi, xác nhận không mở lại kết quả. Việc này không hủy giao dịch đã hoàn thành ở server. |
| Giới hạn tạo đơn chỉ theo tài khoản/phiên khách | Tạo nhiều phiên khách mới có thể vượt giới hạn và lạm dụng việc giữ hàng | Thêm giới hạn 20 yêu cầu/phút/IP, giữ giới hạn 5/phút/tài khoản hoặc phiên. Chỉ tin header IP do Vercel ghi đè khi chạy trên Vercel; ngoài Vercel dùng IP socket. Kiểm thử HTTP với 21 cookie phiên hợp lệ khác nhau và IP chuyển tiếp giả: dịch vụ tạo đơn chỉ được gọi 20 lần, lần thứ 21 trả 429 và Retry-After. |
| Tra cứu nhận object thay vì chuỗi | Đầu vào sai kiểu có thể gây lỗi 500 | Kiểm tra kiểu, chuỗi rỗng và độ dài mã đơn/khóa truy cập trước truy vấn/hash; đầu vào không hợp lệ trả 401 chung, không tiết lộ thông tin đơn. |
| Website thiếu các header bảo mật được kiểm tra | Thiếu lớp hạn chế nhúng iframe, thực thi script và suy đoán MIME | Thêm CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy vào cấu hình website; API có các header phù hợp riêng. Kiểm thử trình duyệt với đúng CSP sinh từ cấu hình xác nhận đăng nhập/lịch sử/tra cứu hoạt động và inline script bị chặn. Header mới chỉ có hiệu lực trên website sau khi triển khai. |

Mã liên quan: `frontend/src/features/auth/auth-context.tsx`, `frontend/src/lib/api-client.ts`, `frontend/src/features/orders/{api.ts,CustomerOrderDetailPage.tsx,GuestOrderLookupPage.tsx}`, `backend/src/{app.js,identity/rate-limiter.js,identity/request-filter.js,order/checkout-controller.js,order/guest-access-service.js}`, `deployment/vercel-config.mjs`.

## Những ranh giới đã kiểm chứng

- JWT thiếu, sai chữ ký/định dạng, hết hạn, sai issuer hoặc audience bị từ chối; tài khoản bị vô hiệu hóa bị từ chối. Kiểm thử sử dụng JWT ES256 và JWKS local thực sự, cùng cơ sở dữ liệu PGlite.
- Khách B không đọc, hủy, báo thanh toán hoặc lấy hướng dẫn thanh toán của đơn thuộc A. API người bán, nhật ký và tổng hợp đơn xác nhận từ chối khách thường. Metadata do người dùng tự sửa và PATCH hồ sơ không nâng được quyền khách thành người bán.
- Cookie khách có HttpOnly, Secure, SameSite=Lax và phạm vi đường dẫn API. Cookie bị sửa bị từ chối; phiên của đơn này không đọc/hủy được đơn khác. Origin lạ bị từ chối trên luồng cookie ngay cả khi kèm Bearer token hợp lệ.
- Truy vấn SQL sử dụng tham số; kiểm tra chủ đơn/shop thực hiện tại backend. Mã truy cập khách dùng token ngẫu nhiên và lưu hash; phiên được ký; dữ liệu idempotency nhạy cảm được mã hóa. Tải ảnh có giới hạn dung lượng, loại ảnh và số pixel; bucket QR thanh toán là private với URL ký có thời hạn.
- Kiểm tra metadata Supabase đang chạy: 28 bảng trong schema `shop` không có quyền truy cập trực tiếp kết hợp schema/table cho role `anon` hoặc `authenticated`. Một số bảng không bật RLS nhưng được bảo vệ bằng việc thu hồi quyền truy cập trực tiếp; không kết luận đó là bảng công khai. `product-images` là bucket public theo chức năng, `payment-qr` là private; không tìm thấy policy ghi Storage công khai trong phạm vi truy vấn đã kiểm tra.
- GET không có xác thực tới các API lịch sử khách, tổng hợp đơn người bán và tra cứu đơn giả trên production đều trả 401 và `Cache-Control: no-store`. Website hiện có HSTS; tại thời điểm kiểm tra chưa trả các header mới nêu trên.
- Không thấy khóa bí mật theo các mẫu khóa/private key đã quét trong file được Git theo dõi. Đây không phải quét toàn bộ lịch sử Git hay bảo đảm mọi định dạng bí mật đều được nhận diện.

## Các điểm cần tiếp tục xử lý

1. **Bảo vệ mật khẩu bị rò rỉ của Supabase Auth đang tắt.** Security Advisor trả một cảnh báo này. Nên bật theo [hướng dẫn chính thức](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), kiểm tra khả năng của gói dự án, rồi kiểm thử đăng ký/đổi mật khẩu. Chưa thay đổi thiết lập live trong lần rà soát này.
2. **Đăng ký đang tự xác nhận email.** API đăng ký khách/người bán sử dụng Admin API với `email_confirm: true`, nên luồng hiện tại không chứng minh người đăng ký sở hữu địa chỉ email. Cần quyết định và triển khai luồng xác minh email trước khi coi email là danh tính đã được xác thực. Chưa đổi hành vi đăng ký vì việc này ảnh hưởng trực tiếp luồng sản phẩm.
3. **JWT đã phát hành có thể còn hiệu lực đến khi hết hạn sau đăng xuất.** Backend kiểm tra JWT và trạng thái hồ sơ, chưa kiểm tra việc thu hồi session cho từng yêu cầu. Xóa cache frontend không thu hồi một access token đã bị lấy cắp. Nếu cần đăng xuất thu hồi quyền tức thì, bổ sung kiểm tra session/revocation hoặc cơ chế tương đương, cùng kiểm thử; xem [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) và [signOut](https://supabase.com/docs/reference/javascript/auth-signout).
4. **Giới hạn IP là một lớp giảm lạm dụng.** IP dùng chung có thể cùng chạm giới hạn; nhiều IP vẫn có thể phân tán lưu lượng. Chưa kiểm thử tải hoặc triển khai CAPTCHA cho luồng công khai.

## Kết quả kiểm thử

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd test` tại root | 88/88 backend và 13/13 cấu hình triển khai đạt |
| `npm.cmd --prefix frontend run build` | Đạt; bộ Playwright cũng build lại frontend sau bản sửa yêu cầu ghi |
| `npm.cmd --prefix frontend run test:e2e:types` | Đạt |
| Lint frontend | Không có lỗi; còn cảnh báo đã có sẵn |
| Playwright desktop/mobile: security-isolation, customer-orders-hub, auth-orders, navigation, feedback-edge-cases | 86/86 đạt |
| Playwright với CSP sinh từ cấu hình triển khai | 2/2 đạt |
| `npm audit --json` riêng từng workspace frontend/backend | Cả hai báo 0 vulnerability; root không có lockfile nên không dùng kết quả audit root |
| `git diff --check` | Đạt |

Bằng chứng local nằm trong `.tools/customer-order-review/security-*.log`, `security-*-audit.json`, `security-public-headers.json` và báo cáo Playwright tương ứng. Các kiểm thử trình duyệt dùng fixture API/Auth; kiểm thử backend dùng dữ liệu local, không phải tài khoản hoặc đơn thật trên production. CSP được áp dụng trong trình duyệt kiểm thử, chưa được xác nhận trên URL deployment mới.

Lần kiểm tra live chỉ đọc metadata/cấu hình và gọi GET/HEAD không có dữ liệu nhạy cảm. Không gửi email, không sửa dữ liệu thật, không thử khai thác trên đơn thật, không thực hiện kiểm thử tải. Báo cáo phản ánh phạm vi đã kiểm tra, không bảo đảm toàn bộ hệ thống không còn lỗ hổng.

Tham khảo cho các header: [MDN frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors), [MDN X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options).
