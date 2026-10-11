# Chat khách hàng và hộp thư chung của người bán

Ngày triển khai và kiểm tra: 11/10/2026.

## Hành vi

- Khách đăng nhập mở **Tin nhắn** tại `/account/chat`. Mỗi khách có một cuộc trò chuyện được giữ lại qua các lần đăng nhập.
- Mọi tài khoản đang hoạt động có role `SELLER` đều xem hộp thư tại `/seller/chat` và trả lời cùng một cuộc trò chuyện. Tin trả lời hiển thị tên người bán, không cần chỉ định hoặc nhận quyền xử lý riêng.
- Guest vẫn thấy nút chat nổi và nút hỏi về sản phẩm trên danh sách/chi tiết. Bấm vào mở thông báo yêu cầu đăng nhập. Sản phẩm đã chọn được chuyển tiếp tới bản nháp sau đăng nhập.
- Có thể tìm sản phẩm trong khung chat, thêm/bỏ sản phẩm, gửi sản phẩm riêng hoặc kèm câu hỏi. Server lấy tên, giá và ảnh từ catalog để lưu cùng tin nhắn; lịch sử không phụ thuộc giá sản phẩm thay đổi về sau.
- Hộp thư tìm theo tên khách, phân trang, hiển thị nội dung gần nhất. Số tin chưa đọc được tính riêng cho từng seller. Khách thấy “Đã đọc” khi một seller đã xem.
- Lịch sử tải 40 tin gần nhất và có nút xem thêm. Tin mới không kéo người dùng khỏi vị trí đang đọc lịch sử. Enter gửi, Shift+Enter xuống dòng; không gửi trong lúc gõ IME.
- Giới hạn 4.000 ký tự; giữ câu hỏi/sản phẩm khi gửi thất bại. Gửi lại cùng mã tin nhắn tránh trùng nếu server đã lưu nhưng phản hồi bị mất.

## Realtime và phân quyền

Frontend dùng Supabase Auth và private Broadcast. Backend Express hiện có tiếp tục là nơi đọc/ghi nội dung, xác minh JWT và kiểm tra profile hiện tại trong DB.

Ba loại topic: `chat:room:<conversationId>`, `chat:inbox:sellers`, `chat:inbox:<authUserId>`. Trigger DB gửi sự kiện `changed` khi có tin mới hoặc tiến độ đọc thay đổi. Broadcast chỉ chứa ID cuộc trò chuyện (Supabase có thể thêm ID sự kiện), không chứa nội dung hoặc thông tin sản phẩm. Client tải lại qua API được phân quyền.

RLS trên `realtime.messages` dùng helper `chat_private.can_receive()` với `auth.uid()`. Chỉ khách sở hữu phòng và seller đang hoạt động có thể đăng ký. Không cấp quyền browser ghi Broadcast. Helper có `search_path` cố định và không nhận ID người dùng tùy ý.

Bảng ứng dụng nằm trong schema `shop` riêng, không expose qua Data API. Cả ba bảng chat bật RLS. Runtime chỉ có SELECT/INSERT với tin nhắn; khách không thể dùng API để xem/gửi/đánh dấu đọc phòng người khác. API kiểm tra trạng thái tài khoản sau mỗi request, kể cả khi quyền của kết nối Realtime đã được cache.

Ghi tin nhắn khóa cuộc trò chuyện trong transaction, tăng sequence và giữ hai ràng buộc unique: thứ tự tin trong phòng và `(conversation, sender, clientMessageId)`. Hai seller gửi đồng thời vẫn có thứ tự ổn định. Giới hạn gửi 30 lần/phút/tài khoản dùng bộ đếm DB hiện có.

Client nối lại khi token đổi, xử lý teardown của React StrictMode, gộp thông báo inbox/phòng và tuần tự hóa các lượt tải cache để tránh request chồng nhau. Polling 15 giây và refetch khi quay lại tab/mạng là đường dự phòng.

Tài liệu Supabase đã đối chiếu: [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

## Dữ liệu và triển khai

- `V5__customer_chat.sql`: bảng conversations, messages, read positions, indexes, constraints và quyền runtime.
- `V6__chat_customer_index.sql`: chỉ mục FK khách hàng, bổ sung sau rà soát Supabase performance advisor.
- `backend/deployment/chat-realtime.sql`: private topic RLS, helper và trigger Supabase.
- `backend/deployment/runtime-grants.sql`: bảo toàn quyền append-only của tin nhắn khi provision runtime lại.

Đã áp dụng hai migration và SQL Realtime lên project Supabase `htmramdkoevxzjqcpesb`. Checksum được ghi trong `shop.schema_migrations`; không cần expose schema `shop` hoặc bật Postgres Changes cho các bảng này. Các biến Supabase Auth/runtime DB hiện có được dùng lại, không đưa secret backend vào frontend.

Với DB mới: chạy migrations ứng dụng bằng owner, provision runtime theo file grants, sau đó áp dụng `chat-realtime.sql` bằng owner Supabase. Với website hiện tại: cần redeploy cả frontend/backend từ repo để đưa các route và giao diện mới lên domain. Lượt này cập nhật code và DB Supabase; chưa publish bản web lên Vercel.

## Kiểm thử và bằng chứng

| Bộ kiểm tra | Kết quả cuối |
|---|---|
| Backend Node/PostgreSQL | 46/46 đạt |
| Deployment contracts | 11/11 đạt |
| Hồi quy Chromium toàn ứng dụng | Đã kiểm tra đủ 438 ca; 432 đạt trong full run, 6 ca còn lại đạt khi chạy lại riêng |
| Chat Firefox, WebKit, Chromium desktop/mobile | Đã kiểm tra đủ 52 ca; 50 đạt trong full run, 2 ca WebKit đạt khi chạy lại riêng |
| Playwright Supabase thật desktop/mobile | 4/4 đạt |
| TypeScript app/e2e/live, production build, diff whitespace | Đạt |
| Lint | 0 lỗi; 18 cảnh báo có sẵn ngoài phần chat |

Bốn ca giỏ hàng được sửa selector để vẫn chọn đúng nút khi nhãn chuyển sang trạng thái đang thêm, đồng thời phân biệt “Mua ngay”. Hai ca hồi quy còn lại gặp lỗi chụp ảnh browser; hai ca WebKit gặp page crash/click timeout. Tất cả các ca này đạt khi chạy lại riêng. Không bật retry để che lỗi trong cấu hình test.

Log: [backend](../backend/.tools/chat-backend-final2.log), [full hồi quy](../frontend/.tools/chat-final-playwright.log), [sáu ca chạy lại](../frontend/.tools/chat-regression-recheck.log), [chat bốn trình duyệt](../frontend/.tools/chat-browser-verified.log), [WebKit chạy lại](../frontend/.tools/chat-webkit-recheck.log), [Supabase thật](../frontend/.tools/chat-live-verified.log).

Backend tests chạy controller thật, JWT ES256/JWKS và PostgreSQL PGlite. Có kiểm tra guest/token giả/tài khoản bị khóa, khách khác truy cập trái phép, hai seller, sequence, dedup, snapshot sản phẩm, giới hạn gửi, pagination, private topic RLS và thu hồi role. PGlite dùng một connection; concurrency với PostgreSQL thật được bổ sung bằng bộ Playwright live.

Playwright thường chạy frontend production build với API fixtures. Bộ live chạy app Express và Supabase Auth, PostgreSQL, WebSocket thật với hai khách và hai seller tạm thời. Có kiểm tra UI desktop/mobile, sản phẩm sau đăng nhập, hai seller trả lời, unread riêng, private room bị từ chối và mất phản hồi sau khi server đã ghi tin. Không tạo đơn, thay đổi kho hay mở nhận đơn trên shop thật.

Setup lưu đúng ID tài khoản thử. Teardown dừng và drain API trước khi xóa dữ liệu, tránh request `/me` còn chạy tạo lại profile. Chỉ xóa đúng ID thử của lượt chạy. File thông tin tài khoản tạm được Git ignore và được xóa khi hoàn tất; trace live tắt để không lưu token/mật khẩu.

Đã kiểm tra lại DB sau teardown: còn 0 Auth account, 0 profile và 0 cuộc trò chuyện thuộc các tài khoản `chat-e2e` thử. Migration V5/V6 được giữ LF trong Git để bảo toàn checksum đã áp dụng.

Lệnh chạy lại:

```powershell
# Repo root: backend và deployment contract checks
npm.cmd test

# frontend: Chromium desktop/mobile, Firefox/WebKit và Supabase thật
npm.cmd run test:e2e:types
npm.cmd run test:e2e
npm.cmd run test:e2e:chat-browsers
npm.cmd run test:e2e:chat-live
```

Nếu browser được cài tại `frontend/.browsers`, đặt `PLAYWRIGHT_BROWSERS_PATH` tới thư mục đó khi chạy bộ thông thường. Live tests cần các env local đã kết nối Supabase và quyền admin Auth để provision tài khoản thử; không chạy nhiều bộ live cùng lúc vì dùng cùng port/state file.

Ảnh giao diện Supabase thật: [khách desktop](../frontend/.tools/chat-live-results/chat-live-real-Supabase-tw-50dc7-unread-and-realtime-replies-desktop-chromium/customer-chat.png), [khách mobile](../frontend/.tools/chat-live-results/chat-live-real-Supabase-tw-50dc7-unread-and-realtime-replies-mobile-chromium/customer-chat.png), [hộp thư seller](../frontend/.tools/chat-live-results/chat-live-real-Supabase-tw-50dc7-unread-and-realtime-replies-desktop-chromium/shared-seller-inbox.png).

Supabase security advisor không báo vấn đề của phần chat. Cảnh báo Auth có sẵn về [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) vẫn giữ nguyên cấu hình hiện tại.

## Responsive và trạng thái gửi tin

Tin nhắn và sản phẩm đính kèm xuất hiện ngay khi gửi. Trạng thái `Đang gửi` cùng vòng xoay nhỏ nằm dưới góc phải tin nhắn; server xác nhận thì đổi thành `Đã gửi`. UI giữ cùng phần tử qua clientMessageId để không nhấp nháy hoặc nhân đôi khi nhận phản hồi/realtime. Gửi lỗi hiển thị dưới tin, giữ bản nháp và dùng lại clientMessageId khi thử lại. API chat giữ timeout và xử lý lỗi nhưng không kích hoạt thanh loading/toast chung; thao tác giỏ hàng, đơn hàng vẫn giữ loading chung.

Hiệu ứng gửi dùng transform/opacity trong 240ms và tắt khi `prefers-reduced-motion`. Trên mobile, khung chat theo chiều cao visual viewport; ẩn điều hướng cố định phía dưới khi đang mở cuộc trò chuyện. Ô nhập 16px, nút chạm 44px, tên dài tự xuống dòng. Màn hình thấp dùng ô nhập và nút gửi trên cùng hàng để giữ vùng đọc tin.

Ca Playwright bổ sung kiểm tra gửi chậm, vị trí indicator, không loading chung, không remount/nhân đôi sau xác nhận, giảm chuyển động, tên sản phẩm dài, khách/seller tại 320px, 375px, 768px, 1440px và màn hình ngang 568×320. Bộ feedback kiểm tra loading chung và timeout của thao tác ngoài chat vẫn hoạt động.

Kiểm tra bản responsive: đủ 34 ca chat Chromium desktop/mobile đã đạt (32 trong full run, hai ca customer sizing gặp lỗi tài nguyên browser đã đạt khi kiểm tra lại thay đổi viewport trực tiếp; bộ sizing 4/4 đạt). Giỏ hàng/feedback 40/40 đạt. Firefox/WebKit cho gửi chậm, sizing khách/seller và reduced motion đạt 8/8. Production build, TypeScript app/e2e/live và lint đạt; không thêm lỗi lint.

Log: [chat Chromium](../frontend/.tools/chat-responsive-final.log), [sizing chạy lại](../frontend/.tools/chat-responsive-sizes.log), [giỏ hàng/feedback](../frontend/.tools/chat-responsive-playwright.log), [Firefox/WebKit](../frontend/.tools/chat-responsive-browser.log).

Live tests chờ trạng thái `Đã gửi` của sender trước khi đo nhận realtime; tin hiển thị trước phản hồi không được coi là đã được server ghi. Kiểm tra unread theo cuộc trò chuyện thử, vì seller có thể còn unread từ khách thật khác. Test bốn phiên Auth có ngân sách tổng 240 giây cho đăng nhập, bảo mật và đóng browser; assertion nhận realtime vẫn giữ 10 giây.

Supabase thật: ca hai seller/realtime/unread/quyền truy cập đã đạt ở desktop và mobile; ca mất phản hồi rồi gửi lại đã đạt ở cả desktop/mobile. [Desktop live](../frontend/.tools/chat-responsive-live-verified.log), [mobile live](../frontend/.tools/chat-responsive-live-mobile-verified.log), [mất phản hồi](../frontend/.tools/chat-responsive-live-final.log). Lượt mobile cuối đạt assertion nhưng teardown bị timeout khi đợi API test đóng pool, nên lệnh test trả lỗi ngoài test. Đã xác nhận API 8081 dừng, dọn đúng ID trong state của lượt thử bằng script cleanup, và kiểm tra Supabase còn 0 Auth account/0 profile `chat-e2e`. Đây là lỗi teardown test; frontend/backend local 5173/8080 vẫn trả HTTP 200.
