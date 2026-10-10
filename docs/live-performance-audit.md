# Kiểm tra tốc độ website thật — 10/10/2026

Website: https://goiamchoem.vercel.app. Đo bằng Chromium/Playwright từ máy hiện tại, truy cập HTTP GET và truy vấn Supabase trong transaction READ ONLY. Không thay đổi đơn hàng, sản phẩm, cấu hình shop hoặc triển khai production.

## Kết luận

Chậm chủ yếu ở việc chờ API lấy dữ liệu từ DB. Backend production chạy tại Washington (`iad1`), DB/pooler Supabase tại Tokyo (`ap-northeast-1`). Backend truy vấn DB nhiều lần tuần tự, đồng thời đóng kết nối nhàn rỗi sau 10 giây, ngắn hơn chu kỳ polling 15 giây của catalog.

Chưa thấy bằng chứng chạm quota trong các phép đo. Đây là kết luận tại thời điểm khảo sát, không phải bảo đảm về mọi thời điểm hoặc mọi giới hạn của tài khoản.

## Kết quả đo

Ba vòng GET liên tiếp, khi backend/kết nối đã được làm nóng:

| Request | Thời gian phản hồi |
| --- | --- |
| HTML `/`, có CDN cache | 36–58 ms ở hai vòng sau |
| Health không truy vấn DB | 275–345 ms |
| Health có một truy vấn DB | 420–456 ms |
| Danh mục | 420–432 ms |
| Thông tin shop | 580–586 ms |
| Combo, hiện không có combo active | 577–598 ms |
| Sản phẩm, hiện có một sản phẩm active | 1.206–1.213 giây |

Trong browser, request sản phẩm mất 1.18–1.20 giây khi kết nối đã được làm nóng; các lượt sau khoảng nghỉ mất 2.09–2.13 giây.

Hai lượt browser không có cache tài nguyên:

| Chỉ số | Desktop | Mobile giả lập Pixel 7 |
| --- | --- | --- |
| FCP: nội dung đầu tiên xuất hiện | 660 ms | 488 ms |
| LCP: phần nội dung lớn nhất trong viewport | 740 ms | 552 ms |
| Sản phẩm đã tải xong, tính từ bắt đầu điều hướng | 2.74 giây | 1.69 giây |
| CLS | 0.0039 | 0 |
| Tổng dung lượng resource body | Khoảng 430 kB | Khoảng 417 kB |
| Font | 13 file, khoảng 234 kB | 12 file, khoảng 220 kB |

LCP chủ yếu đo phần chữ lớn trong hero, nên LCP nhanh không đồng nghĩa danh sách sản phẩm đã sẵn sàng. Đây là phép đo phòng thử nghiệm trên máy hiện tại, không phải dữ liệu người dùng thật, không mô phỏng mạng di động chậm hoặc CPU điện thoại. Không đo INP vì chưa khảo sát thao tác tương tác.

Lượt browser đầu tiên của phiên có khoảng 2.70 giây chờ trước DNS, làm FCP/LCP lần đó thành 3.24/3.55 giây. Không quy khoảng chờ này cho thời gian xử lý website; hai lượt fresh context bổ sung ở trên không gặp hiện tượng đó.

Các request khảo sát không có lỗi 429/5xx hoặc timeout. HTML và assets có CDN HIT; các API trả `private, no-store`, CDN MISS theo cấu hình hiện tại. Không đề xuất cache trạng thái đơn hàng/tồn kho để che độ trễ.

## Bằng chứng và nguyên nhân

1. **Backend và DB ở hai châu lục.** Header API là `x-vercel-id: sin1::iad1::…`; `sin1` là điểm đi qua, `iad1` là vùng thực thi function. URL pooler DB trỏ tới `aws-0-ap-northeast-1.pooler.supabase.com`. Config trong `deployment/vercel-config.mjs` chưa chỉ định vùng. Vercel xác nhận [header chứa vùng thực thi function](https://vercel.com/docs/headers/response-headers#x-vercel-id), mặc định Node function là `iad1` và [khuyến nghị đặt function gần DB](https://vercel.com/docs/regions#compute-defaults).

2. **Nhiều truy vấn tuần tự cho một sản phẩm.** `backend/src/catalog/catalog-service.js:95` chạy count, lấy danh sách, rồi duyệt từng sản phẩm. `productView()` tiếp tục lấy inventory, category, asset cho `image` và lấy lại cùng asset cho `imageUrl`: một sản phẩm có ảnh cần tổng cộng 6 truy vấn. Nhiều sản phẩm sẽ tăng số lượt gọi theo số sản phẩm. Chênh lệch khoảng 150 ms giữa health không DB và health có một query phù hợp với chi phí round trip Mỹ–Tokyo; đây là suy luận từ đo đạc, không phải trace bên trong Vercel.

3. **Chi phí mở lại kết nối sau khoảng nghỉ.** `backend/src/database-config.js:37` đặt `idleTimeoutMillis: 10000`; `frontend/src/lib/query-client.ts:6` đặt catalog polling 15000 ms. Nếu không có request khác giữ pool hoạt động, kết nối có thể đóng trước lần polling kế tiếp. Đo GET danh mục, nghỉ 12.5 giây, gọi health không DB rồi gọi danh mục: health mất 446 ms, danh mục mất 1529 ms, gọi lại ngay danh mục mất 477 ms. Khoảng tăng hơn một giây phù hợp với mở lại kết nối; không có runtime trace để tách tuyệt đối phần mở kết nối và platform cold start. Kết nối DB mới từ máy kiểm tra mất 864 ms.

4. **Font là phần lớn tài nguyên lần tải đầu.** Font chiếm khoảng 54% resource body trên desktop. Có thể tối ưu số weight/subset hoặc dùng variable font phù hợp, giữ đầy đủ tiếng Việt và kiểm tra lại hình thức. Tuy nhiên tài nguyên giao diện không phải nguyên nhân chính của việc sản phẩm vẫn loading sau khi giao diện đã hiện.

5. **Các yếu tố bổ sung trong code, chưa định lượng trên phiên đăng nhập.** Public catalog vẫn đọc session rồi gắn Bearer token; route list gọi `optionalAuth` và tra profile khi có token, dù dữ liệu trả về vẫn public. AuthProvider có cả initial `getSession` và `INITIAL_SESSION` callback gọi profile, có khả năng tạo request `/me` trùng. Không coi đây là nguyên nhân đã được đo trong phiên khách chưa đăng nhập.

## Kiểm tra DB và giới hạn

- Dung lượng database tại thời điểm kiểm tra: 12 MB.
- `max_connections`: 60; `pg_stat_activity` thấy 17 kết nối trực tiếp tại thời điểm chụp. Con số này không bao gồm toàn bộ client của Supavisor và không phản ánh mọi đợt tăng tải.
- Không thấy session chờ Lock trong snapshot có thể quan sát với quyền runtime.
- EXPLAIN ANALYZE: danh mục thực thi 0.088 ms; count sản phẩm 0.047 ms; danh sách sản phẩm 0.057 ms. Planning cũng dưới 0.1 ms mỗi query.
- Một SELECT đơn giản từ máy kiểm tra mất 102–115 ms cả round trip, trong khi SQL thực thi dưới một ms: thời gian truyền/kết nối lớn hơn nhiều thời gian chạy SQL.
- `DB_POOL_MAX=3` là giới hạn pool trong mỗi instance ứng dụng, không phải quota tổng của Supabase. Không tăng pool tùy tiện vì serverless có nhiều instance.
- Chưa có quyền xem dashboard billing/usage, CPU/RAM, số client pooler hoặc logs function production. Không kết luận tuyệt đối rằng mọi giới hạn đều còn dư. [Tài liệu Supabase](https://supabase.com/docs/guides/platform/performance#optimizing-the-number-of-connections) phân biệt kết nối PostgreSQL trong `pg_stat_activity` với client Supavisor.

## Thứ tự tối ưu đề xuất

1. Đặt Vercel function tại Tokyo `hnd1`, cùng vùng với DB hiện tại; không cần di chuyển DB. Đo lại production sau triển khai để xác nhận mức cải thiện. Đây là thay đổi được Vercel khuyến nghị khi nguồn dữ liệu nằm xa function.
2. Gộp đọc product/inventory/category/asset bằng JOIN hoặc batch, dùng lại asset đã đọc. Gộp component/inventory của combo theo lô. Giữ nguyên kiểm tra quyền seller và cách tính tồn kho.
3. Rà vòng đời pool cho serverless, polling và khả năng đóng kết nối khi instance bị treo. Không chỉ kéo dài idle timeout hoặc tăng pool mà chưa kiểm tra tổng kết nối/Fluid compute.
4. Sau đó tối ưu font và loại bỏ request xác thực/profile thừa ở public catalog.

Chưa sửa code ứng dụng hoặc triển khai. Chưa có số đo sau tối ưu; không đưa ra cam kết thời gian tải mới hoặc yêu cầu nâng gói dựa trên các phép đo hiện tại.

## Công cụ và kết quả thô

- `.tools/performance-audit.mjs` và `.tools/performance-live.json`: ba lượt browser, ba vòng GET các endpoint.
- `.tools/performance-cold.mjs` và `.tools/performance-cold.json`: hai lượt browser fresh context desktop/mobile.
- `.tools/performance-db.mjs`: SELECT và EXPLAIN ANALYZE trong transaction READ ONLY; không ghi dữ liệu.
- Các file `.tools` được gitignore; không lưu token, cookie, password hoặc dữ liệu đơn hàng vào kết quả đo.
