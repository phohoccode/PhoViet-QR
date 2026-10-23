# OPEN QUESTIONS — QR Ordering Minimal MVP

> **Phiên bản:** 1.0 · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product Designer + UI Engineer (Gemini)  
> **Mục tiêu:** Liệt kê các quyết định thiết kế và trải nghiệm người dùng (UX) cần thống nhất với Chủ dự án và Codex trước khi bước vào Phase 1 (Dựng hạ tầng & Code UI).  
> **Lưu ý:** Các mục dưới đây đều đã có **Đề xuất mặc định (Recommended Default)** từ góc độ thiết kế để không chặn tiến độ, nhưng chưa được coi là quyết định cuối cùng cho đến khi có xác nhận.

---

## 1. Tiêu chuẩn hiển thị Ảnh món ăn & Giải pháp thay thế khi quán chưa có ảnh

- **Vấn đề:** Không phải quán ăn/cà phê nào khi mới triển khai cũng có sẵn bộ ảnh chụp món ăn chuyên nghiệp, chuẩn kích thước. Nếu thiếu ảnh hoặc ảnh tỷ lệ khác nhau, thẻ món trên mobile sẽ bị xô lệch layout.
- **Đề xuất mặc định của UI:**
  - Quy chuẩn tỷ lệ khung hình ảnh món là **1:1 (Vuông, 80x80px trên mobile list, 160x160px trên popup chi tiết)**.
  - Khi `imageUrl` là `null` hoặc rỗng: Hiển thị một khung placeholder thanh lịch bo góc 12px, nền xám dịu `#F7F8F7`, icon tách cà phê hoặc chén đồ ăn Lucide tối giản ở giữa với màu lục nhạt `#35977D`. Không để trống khung ảnh hoặc để vỡ layout.
- **Cần Chủ dự án xác nhận:** Có chấp nhận phương án placeholder icon tối giản này trong giai đoạn khởi động không?

---

## 2. Trải nghiệm Nhập mã Phiên bàn (Session Code) khi Khách quét QR bàn lần đầu

- **Vấn đề:** Theo `PRD.md` và `ARCHITECTURE.md`, mã QR dán tại bàn là cố định (`/q/:public_code`), còn chủ quán mở phiên bàn với một mã phiên động ngắn (ví dụ: `8821`). Nếu khách dùng ứng dụng camera điện thoại thông thường để quét, khách sẽ vào link mà chưa có phiên hoặc cần nhập mã.
- **Đề xuất mặc định của UI:**
  - Nếu khách quét QR bàn mà thiết bị chưa có cookie/token phiên hợp lệ: Giao diện hiển thị một Modal/Sheet nhập mã phiên gồm 4 ô số to bản (PIN input), kèm dòng hướng dẫn: *"Nhập mã bàn do quán cung cấp (hoặc nhờ nhân viên hỗ trợ)"*.
  - Nếu chủ quán in trực tiếp QR động của từng phiên (từ tab Bàn): URL chứa luôn `sessionCode` để khách quét là vào thẳng menu không phải gõ tay.
- **Cần Codex xác nhận:** Endpoint `/api/public/table-sessions/verify` chấp nhận payload `{ qrCode, sessionCode }` và trả về guest session cookie/token đúng như luồng này hay không?

---

## 3. Thời gian Hiệu lực của Mã VietQR Động cho Đơn Mang đi (Takeaway Timeout)

- **Vấn đề:** Đơn hàng mang đi tạo mã VietQR động để khách thanh toán. Cần xác định khoảng thời gian đếm ngược trước khi mã thanh toán hết hạn (`expired`). Nếu thời gian quá ngắn, khách chuyển khoản không kịp; nếu quá dài, quán bị treo giữ các đơn chờ.
- **Đề xuất mặc định của UI:**
  - Thiết lập đồng hồ đếm ngược là **15 phút** (`15:00`).
  - Giao diện hiển thị đồng hồ đếm lùi màu hổ phách `#A76200`. Khi còn dưới 3 phút, số đếm nhấp nháy nhẹ.
  - Khi hết 15 phút mà webhook chưa xác nhận: Chuyển sang màn hình `PAYMENT_EXPIRED` kèm nút: *"Tạo lại mã thanh toán mới"*.
- **Cần Chủ dự án & Codex xác nhận:** Thời gian hết hạn 15 phút có phù hợp với SLA của cổng thanh toán (payOS/SePay) không?

---

## 4. Hình thức Xác minh Mã Nhận Món Mang đi (Pickup Code Verification) tại Quầy

- **Vấn đề:** Khi món mang đi đã sẵn sàng (`ready`), khách ra quầy nhận đồ. Cần cơ chế xác minh nhanh, tránh trường hợp nhận nhầm hoặc gian lận đơn của người khác.
- **Đề xuất mặc định của UI:**
  - Trên màn hình của khách: Hiển thị mã nhận 4 ký tự chữ số nổi bật: `MÃ NHẬN: TK-8821`.
  - Trên Dashboard Chủ quán (Cột chi tiết đơn hàng): Có một ô input nhỏ để chủ quán gõ nhanh 4 ký tự cuối hoặc bấm nút `[ Xác nhận đã giao ]`.
  - Không triển khai quét camera QR ngược từ điện thoại chủ quán trong MVP để tránh yêu cầu quyền truy cập Camera trình duyệt phức tạp.
- **Cần Chủ dự án xác nhận:** Quán có đồng ý với hình thức đối chiếu mã 4 ký tự bằng mắt/gõ tay tại quầy để tối giản hóa thao tác không?

---

## 5. Vị trí và Mật độ Thanh Sticky Cart trên Màn hình Điện thoại Cực Ngắn (iPhone SE / Chiều cao < 667px)

- **Vấn đề:** Trên các thiết bị điện thoại có chiều cao hạn chế (< 667px), thanh Sticky Cart Bar (`h-14`) cùng thanh điều hướng của trình duyệt (Safari/Chrome bottom bar) có thể che mất một phần sản phẩm cuối cùng trong menu.
- **Đề xuất mặc định của UI:**
  - Thêm một khoảng đệm an toàn `pb-24` (padding bottom 96px) ở đáy danh sách món ăn, đảm bảo món cuối cùng luôn cuộn vượt lên trên thanh giỏ hàng.
  - Áp dụng thuộc tính CSS `env(safe-area-inset-bottom)` cho thanh Sticky Cart để tương thích hoàn hảo với thanh gạt Home của iOS.
- **Cần kiểm thử UI:** Xác nhận khi dựng prototype thực tế trên thiết bị 375x667px.

---

## 6. Tần suất Polling Dự phòng khi Kết nối Supabase Realtime Bị Ngắt quãng

- **Vấn đề:** Mạng 4G hoặc Wi-Fi quán cà phê thường chập chờn. Khi kênh Realtime bị ngắt, giao diện khách và chủ quán cần tự động thăm dò (polling fallback) để không bỏ lỡ thay đổi trạng thái đơn hàng.
- **Đề xuất mặc định của UI:**
  - Đối với Khách hàng đang ở màn hình chờ thanh toán Takeaway: Polling mỗi **3 giây/lần** (tối đa 15 phút).
  - Đối với Khách hàng đang ở màn hình theo dõi đơn (Tracking): Polling mỗi **8 giây/lần**.
  - Đối với Chủ quán ở Dashboard: Polling mỗi **5 giây/lần** khi mất kết nối WebSocket, kèm banner nhỏ: *"Đang dùng kết nối dự phòng"*.
- **Cần Codex xác nhận:** Tần suất polling này có đảm bảo không gây quá tải cho Next.js Route Handlers và Supabase PostgreSQL không?

---

## 7. Xử lý Tranh chấp UI khi Chủ quán Bấm Đóng Bàn trong lúc Khách Đang Mở Giỏ Hàng

- **Vấn đề:** Khách tại bàn đang ngồi chọn thêm món trong giỏ hàng, nhưng chủ quán tại quầy đã bấm "Quyết toán & Đóng bàn" vì tưởng khách đã chuẩn bị về.
- **Đề xuất mặc định của UI:**
  - Khi khách nhấn `[ Xác nhận gọi món ]`, API trả về mã lỗi `SESSION_EXPIRED` hoặc `SESSION_CLOSED`.
  - Giao diện giỏ hàng của khách không bị xóa mất dữ liệu mà hiển thị thông báo nhẹ nhàng: *"Bàn của bạn đã được kết toán. Nếu muốn dùng thêm, vui lòng báo nhân viên để mở lại phiên bàn nhé!"* kèm nút `[ Gọi nhân viên hỗ trợ ]`.
- **Cần Codex xác nhận:** Đảm bảo API trả về đúng mã lỗi `SESSION_EXPIRED` kèm HTTP 400/409 theo đúng quy chuẩn.

---

## 8. Vị trí Trực quan hóa Đơn Đối soát Thanh toán Ngoại lệ (Payment Exception)

- **Vấn đề:** Khi có giao dịch tiền chuyển sai số tiền, chuyển trễ sau 15 phút hoặc webhook lỗi, đơn hàng rơi vào trạng thái `payment_exception`. Chủ quán cần nhìn thấy để xử lý, nhưng tuyệt đối không được đưa đơn này vào hàng đợi chế biến của bếp vì chưa hợp lệ.
- **Đề xuất mặc định của UI:**
  - Không tạo thêm một Tab hay một trang riêng.
  - Đặt một huy hiệu cảnh báo nhỏ màu hổ phách: `[ ⚠️ 1 đơn cần đối soát ]` nằm ngay trong bộ lọc của Tab Đơn hàng (hoặc trong Tab Cài đặt -> Mục 5).
  - Khi bấm vào, mở một Dialog hiển thị thông tin tiền thực nhận từ ngân hàng, thời gian nhận và mã tham chiếu để chủ quán quyết định bấm: `[ Chấp nhận & Cấp số Ticket ]` hoặc `[ Hoàn tiền cho khách ]`.
- **Cần Chủ dự án xác nhận:** Có đồng ý gom mục này vào bộ lọc của Tab Đơn hàng để chủ quán tiện theo dõi tại một màn hình duy nhất không?
