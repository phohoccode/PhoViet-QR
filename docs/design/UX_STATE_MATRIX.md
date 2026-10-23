# UX STATE MATRIX — QR Ordering Minimal MVP

> **Phiên bản:** 1.0 (Phase 0 — Handoff Phase 1) · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product Designer / UI Engineer (Gemini)  
> **Nguồn tham chiếu:** `docs/contracts/types.ts`, `docs/contracts/STATE_MACHINES.md`, `PRD.md`  
> **Nguyên tắc:** Giao diện chỉ phản ánh đúng trạng thái thực tế từ Backend. Không bao giờ tự ý sinh ticket, tự xác nhận đã thanh toán hoặc bypass hàng đợi FIFO.

---

## 1. Bảng Đối Chiếu Nhãn Trạng Thái Chuẩn (Backend Enum → Nhãn UI Tiếng Việt)

Để đảm bảo tính nhất quán tuyệt đối giữa mã nguồn logic của Codex và bản vẽ giao diện của Gemini, bảng quy đổi nhãn dưới đây tuân thủ 100% `types.ts` và `STATE_MACHINES.md`:

| Backend Enum / State | Kiểu Trạng Thái | Nhãn UI Tiếng Việt Chuẩn | Màu sắc & Token UI | Icon Lucide |
|---|---|---|---|---|
| `pending_payment` | `OrderStatus` | **Chờ thanh toán** | Hổ phách: `bg-[#FEF6EE] text-[#8A4D00] border-[#F9DBAF]` | `Clock` / `Hourglass` |
| `accepted` | `OrderStatus` | **Chờ làm** | Xám trung tính: `bg-[#F1F3F2] text-[#55605C] border-[#DDE2E0]` | `CheckCircle2` |
| `preparing` | `OrderStatus` | **Đang làm** | Xanh dương Info: `bg-[#EBF3FB] text-[#1D528A] border-[#CFE2F5]` | `ChefHat` |
| `ready` | `OrderStatus` | **Sẵn sàng** | Xanh ngọc Success: `bg-[#E8F4F0] text-[#165B4B] border-[#C6E7DC]` | `Bell` |
| `completed` | `OrderStatus` | **Đã giao** | Xanh lá đậm: `bg-[#EAF5EA] text-[#1E561E] border-[#C3E4C3]` | `PackageCheck` |
| `cancelled` | `OrderStatus` | **Đã hủy** | Đỏ Danger: `bg-[#FEF3F2] text-[#912018] border-[#FECDCA]` | `XCircle` |
| `payment_exception` | `OrderStatus` | **Cần đối soát thanh toán** | Hổ phách đậm: `bg-[#FFF4E5] text-[#B25E00] border-[#FFD699]` | `AlertTriangle` |
| `unpaid` | `PaymentStatus` | **Chưa thanh toán** | Xám nhạt: `bg-[#F7F8F7] text-[#727B77] border-[#E9ECEA]` | `CreditCard` |
| `pending` | `PaymentStatus` | **Đang xác nhận thanh toán** | Hổ phách nhấp nháy: `bg-[#FEF6EE] text-[#8A4D00]` | `Loader2` |
| `paid` | `PaymentStatus` | **Đã thanh toán** | Xanh ngọc Success: `bg-[#E8F4F0] text-[#165B4B]` | `Check` |
| `failed` | `PaymentStatus` | **Thanh toán thất bại** | Đỏ: `bg-[#FEF3F2] text-[#912018]` | `X` |
| `expired` | `PaymentStatus` | **Thanh toán hết hạn** | Xám đỏ: `bg-[#F5EBEB] text-[#7A3E3E]` | `TimerOff` |
| `exception` | `PaymentStatus` | **Cần đối soát** | Hổ phách: `bg-[#FEF6EE] text-[#8A4D00]` | `AlertCircle` |
| `open` | `TableSessionStatus` | **Đang có khách** | Xanh ngọc: `bg-[#E8F4F0] text-[#165B4B]` | `Users` |
| `checkout_pending` | `TableSessionStatus` | **Chờ tính tiền** | Vàng: `bg-[#FFF9E6] text-[#8C6D00]` | `Receipt` |
| `closed` | `TableSessionStatus` | **Bàn trống** | Xám: `bg-[#F7F8F7] text-[#727B77]` | `Square` |

---

## 2. Ma Trận Trạng Thái Giao Diện Chi Tiết (UX State Matrix)

| Actor / Screen | Backend State / Error Code | UI Hiển Thị (Visual Presentation) | Primary Action Enabled? | Cơ Chế Phản Hồi / Retry (Feedback & Recovery) | Yêu Cầu Dữ Liệu (Data Requirements) |
|---|---|---|---|---|---|
| **Guest · QR Entry** | `requiresSessionCode: true` (Chưa xác thực) | Modal nhập PIN 4 số lớn, tiêu đề "Xác thực Bàn XX", nền mờ che menu | ❌ Disabled cho đến khi gõ đủ 4 chữ số | Tự động focus ô số 1, rung nhẹ nếu nhập thiếu ký tự | `QRResolution.requiresSessionCode = true`, `store`, `table` |
| **Guest · QR Entry** | `SESSION_REQUIRED` / Mã phiên sai | 4 ô số bôi đỏ `#B42318`, rung lắc (shake), dòng chữ "Mã phiên không chính xác" | ❌ Disabled khi đang báo lỗi, tự kích hoạt khi sửa số | Xóa trắng 4 ô, focus lại ô đầu tiên để khách gõ lại | `ApiError { code: 'SESSION_REQUIRED' }` |
| **Guest · QR Entry** | `SESSION_EXPIRED` / Phiên bàn đã đóng | Dialog cảnh báo màu đỏ: "Phiên của bàn này đã đóng hoặc QR hết hạn" | ❌ Khóa hoàn toàn nút đặt món | Nút `[ Quét lại QR ]` hoặc `[ Gọi nhân viên hỗ trợ ]` | `ApiError { code: 'SESSION_EXPIRED' }` |
| **Guest · QR Entry** | `INVALID_QR` / QR bị vô hiệu hóa | Màn hình lỗi toàn trang: "Mã QR không hợp lệ hoặc đã bị khóa" | ❌ Không có action đặt món | Nút `[ Thử lại ]` hoặc liên hệ chủ quán | `ApiError { code: 'INVALID_QR' }` |
| **Guest · QR Entry** | `STORE_NOT_ACCEPTING_ORDERS` | Banner đầu trang màu hổ phách: "Quán hiện đang tạm ngưng nhận đơn" | ❌ Khóa toàn bộ các nút thêm giỏ và thanh toán | Menu chuyển sang chế độ chỉ xem (View-only) | `store.acceptingOrders = false` |
| **Guest · Menu** | `MenuView` bình thường | Danh sách món theo danh mục, thẻ món có ảnh, tên, giá, nút `[ + Thêm ]` | ✅ Nút `+ Thêm` hoạt động bình thường | Món không có option: thêm thẳng + Toast Sonner. Món có option: mở Sheet tùy chọn | `MenuView { categories, items }` |
| **Guest · Menu / Cart** | `OUT_OF_STOCK` (Hết hàng giữa chừng) | Thẻ món mờ 50%, badge đỏ nhạt `Hết hàng`. Nếu trong giỏ: dòng món bị đánh dấu đỏ | ❌ Khóa nút `[ Tiếp tục đặt hàng ]` trong giỏ hàng | Toast cảnh báo: "Món [X] vừa hết hàng. Vui lòng xóa khỏi giỏ để tiếp tục" | `ApiErrorDetails.menuItemIds` |
| **Guest · Cart** | `PRICE_CHANGED` (Đổi giá lúc đang chọn) | Dòng món trong giỏ nhấp nháy vàng, hiển thị giá mới và giá cũ gạch ngang | ⚠️ Đổi CTA thành `[ Cập nhật lại giá & Tiếp tục ]` | Hiển thị Banner: "Giá món [X] đã thay đổi. Vui lòng xác nhận lại tổng tiền" | `ApiErrorDetails.currentPrices` |
| **Guest · Cart** | `CartLine.length === 0` (Giỏ trống) | Tranh vẽ tối giản giỏ hàng rỗng, text: "Giỏ hàng đang trống", nút khám phá menu | ❌ Không có nút thanh toán | Bấm nút khám phá sẽ tự động đóng Sheet giỏ hàng | Local cart state trống |
| **Guest · Checkout** | `DUPLICATE_REQUEST_CONFLICT` / Retry | Giữ nguyên trạng thái loading, kiểm tra phản hồi từ backend | ⏳ Giữ disabled tránh bấm liên tục | Server trả về đơn hàng đã tạo trước đó với cùng `clientRequestId` | `clientRequestId` (UUID v4) |
| **Guest · Dine-in** | `accepted` (Vừa gửi đơn thành công) | Chuyển ngay sang trang Tracking, hiển thị số Ticket lớn `#028`, nhãn `Bàn 05` | ✅ Nút `[ + Gọi thêm món ]` kích hoạt | Rung xúc giác nhẹ (Haptic), toast: "Đã gửi đơn vào bếp thành công" | `DineInOrderSummary` (`ticketNo: 28`, `status: 'accepted'`) |
| **Guest · Dine-in** | `preparing` (Đang chế biến) | Bước 2 trong thanh tiến trình sáng xanh, icon nón đầu bếp nhấp nháy | ✅ Có thể gọi thêm món | Tự động cập nhật qua Realtime hoặc Polling fallback (8s/lần) | `OrderDetail.status = 'preparing'` |
| **Guest · Dine-in** | `ready` (Món đã sẵn sàng) | Bước 3 sáng rực rỡ, chuông reo nhẹ, nhãn: "Món đã xong · Nhân viên đang mang ra bàn" | ✅ Có thể gọi thêm món | Thông báo nổi trên màn hình khách | `OrderDetail.status = 'ready'` |
| **Guest · Dine-in** | `completed` (Đã phục vụ ra bàn) | Bước 4 sáng, text: "Đơn hàng đã được phục vụ. Chúc bạn ngon miệng!" | ✅ Có thể gọi thêm món | Giữ nguyên lịch sử các món đã gọi của phiên bàn | `OrderDetail.status = 'completed'` |
| **Guest · Takeaway** | `pending_payment` (Chờ quét VietQR) | Hiện mã VietQR động, số tiền, mã tham chiếu, đồng hồ đếm ngược 15:00. **TUYỆT ĐỐI KHÔNG CẤP TICKET** | ❌ Nút `Đang tự động kiểm tra...` bị disabled | Cảnh báo hổ phách: "KHÔNG chuyển khoản lần hai nếu đã chuyển tiền trên app!" | `TakeawayPaymentViewState.intentStatus = 'pending'`, `ticketNo: null` |
| **Guest · Takeaway** | `PAYMENT_EXPIRED` (Hết hạn 15 phút) | Mã QR bị làm mờ xám, text: "Mã thanh toán đã hết hạn sau 15 phút" | ⚠️ Đổi nút thành `[ Tạo lại mã thanh toán mới ]` | Bấm nút sẽ sinh lại intent thanh toán mới với cùng giỏ hàng | `TakeawayPaymentViewState.intentStatus = 'expired'` |
| **Guest · Takeaway** | `PAYMENT_MISMATCH` / `exception` | Banner cảnh báo: "Giao dịch cần đối soát. Vui lòng liên hệ nhân viên tại quầy" | ❌ Khóa tự động, chuyển sang hỗ trợ | Hướng dẫn khách đưa màn hình biên lai ngân hàng cho chủ quán | `PaymentStatus = 'exception'`, `ticketNo: null` |
| **Guest · Takeaway** | Webhook Paid nhưng UI đang re-sync | Hiển thị màn hình trung gian: "Đang hoàn tất cấp số thứ tự...", icon xoay | ⏳ Đang đồng bộ, không cấp ticket giả | Polling 2s/lần cho đến khi nhận được `ticketNo` chính thức từ DB | Backend `status: 'accepted'` nhưng client đang fetch |
| **Guest · Takeaway** | Paid thành công & Có Ticket | Chuyển sang Tracking, hiển thị số Ticket lớn `#029`, Hộp bảo mật: `MÃ NHẬN: TK-8821` | ✅ Xuất trình mã nhận tại quầy | Nhắc nhở: "Đến quầy đọc mã nhận khi có thông báo sẵn sàng" | `TakeawayOrderSummary` (`ticketNo: 29`, `pickupCode`) |
| **Guest · Takeaway** | `ready` (Đồ uống đã làm xong) | Đổi nền trang sang xanh nhạt, text: "Đồ uống đã sẵn sàng! Mời bạn đến quầy nhận" | ✅ Nút `[ Xem lại mã nhận món ]` | Điện thoại rung chuông báo hiệu | `OrderDetail.status = 'ready'` |
| **Guest · Takeaway** | `completed` (Đã nhận đồ uống) | Checkmark hoàn tất, text: "Đã giao hàng thành công. Cảm ơn bạn!" | ℹ️ Xem lịch sử đơn | Màn hình lưu lại hóa đơn điện tử | `OrderDetail.status = 'completed'` |
| **Owner · Queue** | Hàng đợi trống (`Queue Empty`) | Cột trái hiển thị minh họa thư thái: "Hiện không có đơn nào đang chờ xử lý" | ❌ Nút `Nhận đơn tiếp theo` disabled (mờ 50%) | Tự động lắng nghe Realtime khi có đơn mới xuất hiện | `OwnerQueueView.orders.length === 0` |
| **Owner · Queue** | Có đơn `accepted` chờ làm | Nút `[ ▶ NHẬN ĐƠN TIẾP THEO ]` sáng xanh ngọc `#1D725E`, hiển thị số lượng chờ | ✅ **NÚT DUY NHẤT ĐƯỢC PHÉP BẤM ĐỂ BẮT ĐẦU** | Bấm nút gọi atomic API `POST /claim-next`, tự động chọn đơn cũ nhất | `OwnerQueueView.orders` có đơn `accepted` |
| **Owner · Queue** | Đơn đang chọn `preparing` | Cột chi tiết bên phải hiển thị nút `[ ✓ Đánh dấu sẵn sàng ]` | ✅ Nút `Sẵn sàng` kích hoạt; Nút `Giao` disabled | Bấm nút chuyển đơn sang `ready` | `OrderDetail.status = 'preparing'` |
| **Owner · Queue** | Đơn đang chọn `ready` (Dine-in) | Cột chi tiết hiển thị nút `[ Đã phục vụ ra bàn ]` | ✅ Kích hoạt nút phục vụ ra bàn | Bấm nút chuyển đơn sang `completed` | `OrderDetail.status = 'ready'`, `type = 'dine_in'` |
| **Owner · Queue** | Đơn đang chọn `ready` (Takeaway) | Cột chi tiết hiển thị ô nhập mã nhận món + Nút `[ Xác minh & Đã giao ]` | ⚠️ Nút `Đã giao` chỉ sáng khi đã gõ mã đối soát | Server kiểm tra hash mã nhận; nếu đúng chuyển `completed` | `OrderDetail.status = 'ready'`, `type = 'takeaway'` |
| **Owner · Hai tab** | Cùng bấm `claim-next` đồng thời | Tab nhanh hơn nhận đơn; Tab chậm hơn nhận `409` hoặc nhận đơn kế tiếp | ℹ️ Tự động cập nhật lại danh sách hàng đợi | Toast thông báo: "Đơn vừa được nhận bởi phiên làm việc khác" | `ApiError { code: 'INVALID_STATE_TRANSITION' }` |
| **Owner · Tables** | Đóng bàn khi còn đơn chưa xong | Modal cảnh báo: "Bàn 05 còn 1 đơn đang chế biến. Bạn có chắc muốn đóng bàn?" | ⚠️ Yêu cầu tick chọn: "Xác nhận đã xử lý xong các món" | Tránh việc thu tiền sót món khi quán đông | `TableSessionDetail.orders` có đơn `preparing/ready` |
| **Owner · Tables** | Settle khi khách vừa gọi thêm | API trả về `SESSION_CHECKOUT_PENDING` hoặc tổng tiền thay đổi | ⚠️ Modal cập nhật lại tổng hóa đơn mới nhất | Hiển thị: "Khách vừa gọi thêm món. Hóa đơn đã được cập nhật thành XXX.000 đ" | `TableSessionView.version` tăng |
| **Tất cả các bên** | Mất kết nối Realtime / Mất mạng | Banner cố định đỉnh màn hình: "🔴 Mất kết nối mạng. Đang tự động kết nối lại..." | ⏳ Tạm hoãn các thao tác submit mới | Kích hoạt Polling fallback định kỳ (Guest: 5s, Owner: 5s) | Client network offline listener |
| **Khách truy cập** | Mở URL `/dashboard` không quyền | Màn hình trắng chuyển hướng ngay lập tức về `/login` | ❌ Bị chặn bởi Route Guard / Middleware | Thông báo lỗi: "Vui lòng đăng nhập tài khoản chủ quán để tiếp tục" | `ApiError { code: 'UNAUTHORIZED' }` |

---

## 3. Quy Tắc Bất Biến trong Trải Nghiệm Người Dùng (Invariants)

1. **Khách hàng không bao giờ thấy Ticket giả:** Trong mọi tình huống mạng lag, giao dịch đang chờ webhook hoặc ứng dụng ngân hàng báo trừ tiền, UI chỉ hiển thị thông báo "Đang xác nhận thanh toán...". Tuyệt đối không tự render số thứ tự nếu server chưa trả về `ticketNo`.
2. **Chủ quán không bao giờ được nhảy cóc đơn hàng (No FIFO Bypass):** Không có nút "Bắt đầu làm" riêng trên từng thẻ đơn lẻ. Thao tác tiếp nhận chế biến bắt buộc phải đi qua nút `[ ▶ Nhận đơn tiếp theo ]`.
3. **Takeaway bắt buộc phải có đối soát mã nhận:** Món mang đi chỉ được chuyển sang `completed` khi chủ quán nhập hoặc xác nhận mã đối chiếu khớp với mã người mua xuất trình tại quầy.
4. **Dine-in không bao giờ bị khóa gọi thêm khi chưa thanh toán:** Trong suốt thời gian phiên bàn ở trạng thái `open`, khách có thể gọi thêm món bất kỳ lúc nào; mỗi lần gọi sinh một Ticket FIFO mới và hóa đơn được tự động gộp vào phiên bàn.
