# Audit vòng lặp API tại /q/[code]

Ngày 23/10/2026. Đã sửa theo yêu cầu audit của chủ dự án; phạm vi lần này bao gồm container UI đang nối cart facade. Không đổi backend, rate-limit policy, Supabase schema hoặc dependencies.

## Nguyên nhân và bằng chứng trước sửa

`CustomerQRContainer` có hai effect riêng fetch R01 QR và R03 menu, cùng dependency `cart`. `useCart()` trả một object facade mới mỗi render. Effect menu nhận response → `cart.reconcileWithMenu()` cập nhật external store → re-render → object `cart` khác → effect cleanup/restart → fetch menu tiếp. Khi QR chưa trả xong, effect QR cũng bị restart, response cũ bị bỏ qua bằng `isMounted` trong khi request đã phát ra vẫn chạy.

Đồng thời `usePresentationCart` đã gọi `useCart`, hook này tự initialize R01/R03 và refresh khi online/visible. Như vậy container và domain có hai nơi cùng tải dữ liệu. React StrictMode trong development phát hiện vòng đời mount/cleanup làm số request ban đầu tăng thêm. Khi server trả429, client chưa có cooldown nên tiếp tục gây thêm lỗi rate limit.

Đo trên trình duyệt development trước sửa: **14 request QR/menu trong khoảng2,5giây**, trong đó6QR và8menu. Đây là request loop ở frontend; không phải cơ chế polling nghiệp vụ mong muốn. Không tăng limit server để che lỗi.

## Thay đổi

- Container bỏ cả hai effect fetch và phần retry fetch riêng. Resolution/menu/loading/error lấy từ cùng cart store. QR đổi vẫn remount bằng `key={qrCode}`. R02 verify là mutation riêng, không tự lặp.
- Store gộp refresh đang chạy thành cùng Promise, vẫn gọi R01 rồi R03 tuần tự. Không gọi menu nếu QR thất bại. Loại response cũ sau offline/unmount/R02; online event với giá trị không đổi không vô tình invalidate request.
- Hook trì hoãn khởi tạo đến microtask còn mounted để tránh request của lượt mount thử StrictMode; không phụ thuộc facade object trong effect. Auto refresh khi visible/online gộp và giới hạn một lần trong30giây; explicit retry/review vẫn fetch mới khi không cooldown. Không thêm interval polling API.
- `MenuApiError.retryAfterSeconds` đọc `Retry-After` dạng giây hoặc HTTP date, kết hợp body `details.retryAfterSeconds` lấy thời gian lớn hơn, fallback60giây. Kể cả429 body không phải JSON vẫn giữ cooldown. Adapter không tự retry.
- Store ghi RAM-only `refreshing`, `loadError:{stage,status,code,message,retryAt}`. Khi429, mọi refresh/retry/reconnect/visibility trước deadline bị chặn tại store. Timer UI chỉ cập nhật countdown, không gọi API hoặc tự retry sau expiry. QR error khóa nút retry đến hết thời gian; menu error hiện thông báo và store vẫn chặn click sớm.
- UI và cart cùng dùng menu snapshot; ảnh/options lấy từ menu trong store. Không giả dữ liệu thành công khi API lỗi ở development. Mocks/toolbar chỉ bật khi chọn explicit `?demoState=...`; demo dùng loader RAM riêng, không gọi backend và không persist. Chuyển chế độ preview cập nhật cả store và display.
- Không đổi code do người dùng sửa tại `TableVerificationCard.tsx`, `ItemDetailSheet.tsx`, `StickyCartPreview.tsx`, mocks. Các file này có thay đổi sẵn trong worktree.

## Kiểm chứng thực tế

Trình duyệt localhost development, giữ StrictMode:

1. Load QR thật → **1GET QR200 + 1GET menu200**. Chờ idle, nhập search, phát10lần visibility+online → vẫn2request; không lặp.
2. Mock transport QR429 + Retry-After3giây → chỉ1request, không gọi menu; nút retry disabled. Chờ hết cooldown không tự fetch; bấm thử lại → thêm đúng1request. Đây là transport mock kiểm hành vi UI, không làm cạn rate limit trên Supabase.
3. QR thật200 + mock transport menu429 → tổng2request. Bấm tải lại/chuyển tab/online10lần trước deadline → vẫn2request, hiển thị lỗi thật.
4. Sau kiểm tra, reload lại route thật để bỏ transport mock.

Regression tests mới: `tests/unit/cart/request-lifecycle.test.ts`,12cases: refresh coalescing/sequencing, cooldown cả QR/menu, giữ cart,500/manual retry, unchanged online, stale R01 sau verify, Retry-After seconds/date/body/fallback và non-JSON429. Các tests cũ tiếp tục kiểm SSR, cart scope/storage/reconciliation.

| Kiểm tra | Kết quả |
| --- | --- |
| `npm exec -- vitest run --config tests/unit/vitest.config.mts` | PASS59/59 |
| `npm exec -- vitest run --config tests/ui/vitest.config.mts` | PASS36/36 |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Cart client vẫn không authorize order hoặc xác nhận giá/thanh toán. Lần sửa này không tạo order, FIFO, payment và không giảm bảo vệ rate limit phía server.

## Tái kiểm tra trên bản hiện tại

Ngày 23/10/2026, commit `32f2ab1`: bản sửa trên đã có trong repo, không cần áp dụng lại. Các thay đổi P2-C04 đang có trong worktree được giữ nguyên.

- Mở QR thật trong browser context mới tại localhost:3000: đúng 1 GET QR 200 rồi 1 GET menu 200.
- Nhập tìm kiếm, phát 20 lượt sự kiện visibility/online và kiểm tra lại network: vẫn chỉ 2 request API, không có vòng lặp.
- Giả lập transport QR 429 với Retry-After 3 giây: chỉ 1 request QR, không tải menu và không tự retry khi hết hạn. Bấm thử lại sau deadline tạo thêm đúng 1 request; 20 lượt click/visibility/online ngay sau đó không tạo thêm request, nút retry bị khóa trong cooldown.
- Reload lại trang sau kiểm tra để gỡ transport mock.
- Chạy lại bằng Node trực tiếp để tránh npm/PowerShell xử lý sai tham số: `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` PASS 59/59; cấu hình `tests/ui/vitest.config.mts` PASS 36/36.
- `npm run lint`, `npm run typecheck`, `git diff --check`: PASS. Không chạy lại build trong lần tái kiểm tra này.
