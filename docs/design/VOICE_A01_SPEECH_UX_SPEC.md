# VOICE_A01 — ĐẶC TẢ THIẾT KẾ TRẢI NGHIỆM GIỌNG NÓI (SPEECH UX SPEC)
**Tài liệu đặc tả chi tiết giao diện, thông điệp và hành vi âm thanh cho Khách hàng & Chủ quán**  
**Phong cách thiết kế:** Minimal Emerald POS (`#35977D` / `#1D725E`, bo góc mềm, không thêm giao diện cồng kềnh)  
**Agent:** Gemini (UI/UX, Accessibility, Next.js Presentation)  
**Tài liệu tham chiếu:** `docs/audits/VOICE_A01_GEMINI_NOTIFICATION_UX_AUDIT.md`  
**Trạng thái:** CHỈ ĐẶC TẢ THIẾT KẾ — CHỜ REVIEW TRƯỚC KHI THỰC HIỆN CODE (IMPLEMENT)  
**Ngày lập:** 24/10/2026  

---

## 1. Vị trí & Cấu trúc Nút điều khiển âm thanh (Volume Toggle)

Thiết kế tích hợp hài hòa vào cấu trúc giao diện hiện tại mà **không tạo thêm thanh công cụ hay thanh menu mới**, tuân thủ 100% ngôn ngữ thiết kế Minimal Emerald.

### 1.1. Trên giao diện Chủ quán (Owner Dashboard)

#### Vị trí chính: Thanh Header Hàng đợi ([QueueHeader.tsx](file:///e:/Project/QR-Ordering-PV/src/components/owner/orders/QueueHeader.tsx#L87-L105))
- Đặt tại cụm điều khiển bên phải, ngay cạnh nút *"Làm mới"* (`RefreshCw`) và thời gian cập nhật.
- **Wireframe dạng văn bản (Desktop >= 1024px)**:
  ```
  +---------------------------------------------------------------------------------------------------------+
  | [Đơn hàng]  Chờ: 0  |  Đang làm: 2  |  Sẵn sàng: 1           (o) Cập nhật: 10:48  [Loa: Bật]  [Làm mới] |
  +---------------------------------------------------------------------------------------------------------+
  ```
- **Quy cách hiển thị**:
  - *Khi Tắt (`OFF`)*: Nền `#F7F8F7`, viền `#E9ECEA`, chữ xám `#727B77`, icon `VolumeX` kích thước 16x16px, nhãn: *"Âm báo: Tắt"*.
  - *Khi Bật (`ON`)*: Nền `#E8F4F0`, viền `#C6E7DC`, chữ xanh đậm `#165B4B`, icon `Volume2` màu `#1D725E`, nhãn: *"Âm báo: Đang bật"*.
  - *Mobile (< 1024px)*: Rút gọn thành nút tròn icon 44x44px có `aria-label="Bật/Tắt thông báo bằng giọng nói"` để tiết kiệm diện tích bề ngang nhưng vẫn đảm bảo touch target lớn.

#### Vị trí phụ: Tab Cài đặt quán ([OwnerSettingsView.tsx](file:///e:/Project/QR-Ordering-PV/src/components/owner/settings/OwnerSettingsView.tsx))
- Bổ sung một Card tùy chọn tinh gọn: **"Âm báo & Giọng nói"**:
  - Công tắc chính (Switch toggle): Bật/Tắt thông báo giọng nói.
  - Bộ chọn sự kiện (Radio pills):
    - `[x] Chỉ đơn mới (Mặc định - Khuyên dùng)`
    - `[ ] Đơn mới + Khách gọi thanh toán`
    - `[ ] Tắt toàn bộ âm thanh`
  - Nút *"Nghe thử âm thanh"* (`Volume2` + *"Thử giọng đọc"*): Phát câu mẫu cố định: *"Phở Việt xin chào. Hệ thống thông báo âm thanh hoạt động tốt."*

---

### 1.2. Trên giao diện Khách hàng (Customer UI)

#### Vị trí: Thanh Header màn hình theo dõi đơn ([OrderTrackingView.tsx](file:///e:/Project/QR-Ordering-PV/src/components/customer/order/OrderTrackingView.tsx))
- **MẶC ĐỊNH LUÔN TẮT 100%**: Khách hàng lần đầu mở trang không bị phát âm thanh bất ngờ.
- Nút loa dạng viên thuốc nhỏ (Pill badge) nằm tinh tế ở góc phải phía trên thẻ trạng thái đơn hàng.
- **Wireframe dạng văn bản (Mobile 360px - 430px)**:
  ```
  +-------------------------------------------------------------+
  | [< Thực đơn]           Theo dõi đơn hàng       [ (Loa) Âm thanh ] |
  +-------------------------------------------------------------+
  |  Phiếu #025 - Mang đi                                       |
  |  [ Chuông ] Món của bạn đã sẵn sàng!                        |
  |             Vui lòng đến quầy nhận món                      |
  +-------------------------------------------------------------+
  ```
- **Quy cách hiển thị**:
  - *Khi Tắt (`OFF` - Mặc định)*: Nền trắng, viền `#E9ECEA`, chữ `#727B77`, icon `VolumeX`.
  - *Khi Bật (`ON`)*: Nền `#E8F4F0`, viền `#C6E7DC`, chữ `#1D725E`, icon `Volume2`.
  - Kèm một tooltip nhẹ nhàng chỉ xuất hiện 1 lần duy nhất khi khách nhận đơn Takeaway: *"Bật âm báo để không lỡ khi món xong tại quầy"*.

---

## 2. Bảng đặc tả trạng thái UI (UI State Table)

| Trạng thái | Điều kiện kỹ thuật | Biểu tượng (Lucide) | Nhãn hiển thị trực quan (Visual Label) | Thuộc tính A11y (ARIA) | Hành vi khi Click / Tap |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **OFF** *(Mặc định)* | Người dùng chưa bật âm thanh | `VolumeX` | *"Âm báo: Tắt"* (Desktop)<br>Icon tròn (Mobile) | `aria-label="Bật thông báo giọng nói"`<br>`aria-pressed="false"` | Kích hoạt AudioContext, phát âm thanh thử ngắn, chuyển sang `ON` |
| **ENABLING** | Đang kiểm tra voice list từ browser | `Loader2` (quay nhẹ) | *"Đang kích hoạt..."* | `aria-busy="true"`<br>`aria-label="Đang kết nối giọng đọc"` | Tạm thời disable click trong 0.5s |
| **ON** | Đang hoạt động bình thường | `Volume2` | *"Âm báo: Bật"* (Desktop)<br>Icon xanh `#1D725E` (Mobile) | `aria-label="Tắt thông báo giọng nói"`<br>`aria-pressed="true"` | Tắt âm báo ngay lập tức, hủy mọi câu đang đọc dở, chuyển sang `OFF` |
| **UNSUPPORTED** | Trình duyệt không hỗ trợ Web Speech API | `VolumeX` (opacity 40%) | *"Không hỗ trợ"* | `aria-disabled="true"`<br>`title="Trình duyệt chưa hỗ trợ giọng đọc"` | Hiển thị toast nhẹ: *"Thiết bị hoặc trình duyệt không hỗ trợ Web Speech API"* |
| **BLOCKED** | Bị trình duyệt chặn Autoplay Policy | `AlertCircle` | *"Cần chạm để bật tiếng"* | `aria-label="Chạm để cấp quyền âm thanh"` | Kích hoạt gesture click để mở khóa AudioContext của trình duyệt |
| **ERROR** | Lỗi engine đọc hoặc mất kết nối | `VolumeX` | *"Lỗi âm thanh"* | `role="alert"`<br>`aria-label="Lỗi phát âm thanh"` | Tự động fallback sang hiển thị Toast trực quan, reset về `OFF` |

---

## 3. Catalog Câu đọc Tiếng Việt chuẩn (Message Catalog)

### 3.1. Quy tắc phát âm & Đọc số trong môi trường quán ăn
1. **Đọc số thứ tự (Ticket Number)**:
   - Các số nhỏ hơn 10: Đọc rõ từng chữ: `01` -> *"số một"*, `06` -> *"số sáu"*.
   - Các số tròn chục và ghép: `#025` -> *"số hai mươi lăm"*, `#015` -> *"số mười lăm"*, `#100` -> *"số một trăm"*.
2. **Đọc tên bàn (Table Label)**:
   - Giữ đúng cách gọi thân thuộc của quán: `Bàn 01` -> *"Bàn một"*, `Bàn 05` -> *"Bàn năm"*, `Bàn VIP` -> *"Bàn VIP"*.
3. **Cấu trúc câu**: Luôn đặt đối tượng thông báo lên đầu, độ dài câu từ **5 đến 12 từ**, thời lượng đọc không quá **3 giây**.

### 3.2. Bảng Catalog Thông Điệp Chi Tiết

| Mã sự kiện | Đối tượng | Tình huống kích hoạt | Mẫu câu đọc Tiếng Việt chuẩn | Placeholder an toàn |
| :--- | :--- | :--- | :--- | :--- |
| **MSG-OWN-01** | Chủ quán | Đơn tại bàn mới vào hàng đợi | *"Có đơn mới tại {tableLabel}, số phiếu {ticketNumber}."* | `{tableLabel}`: Bàn 01<br>`{ticketNumber}`: 25 |
| **MSG-OWN-02** | Chủ quán | Đơn mang đi mới đã thanh toán | *"Có đơn mang đi mới, số phiếu {ticketNumber}."* | `{ticketNumber}`: 26 |
| **MSG-OWN-03** | Chủ quán | Dồn nhiều đơn mới (>= 2 đơn trong 3s) | *"Có {count} đơn mới trong hàng đợi."* | `{count}`: 3 |
| **MSG-OWN-04** | Chủ quán | Bàn yêu cầu thanh toán | *"{tableLabel} yêu cầu thanh toán."* | `{tableLabel}`: Bàn 05 |
| **MSG-OWN-05** | Chủ quán | Ngoại lệ đối soát cần kiểm tra | *"Có giao dịch cần đối soát thanh toán."* | *(Không chứa số tiền hay STK)* |
| **MSG-CUS-01** | Khách Takeaway | Thanh toán VietQR thành công | *"Đơn số {ticketNumber} đã thanh toán thành công."* | `{ticketNumber}`: 26 |
| **MSG-CUS-02** | Khách Takeaway | Món đã làm xong, sẵn sàng ra quầy | *"Đơn số {ticketNumber} đã sẵn sàng. Vui lòng đến quầy nhận món."* | `{ticketNumber}`: 26 |
| **MSG-CUS-03** | Khách Takeaway | Đã xác minh mã và nhận món | *"Cảm ơn quý khách. Hẹn gặp lại!"* | — |
| **MSG-CUS-04** | Khách Dine-in | Đặt món thành công (tùy chọn) | *"Quán đã nhận đơn số {ticketNumber}."* | `{ticketNumber}`: 25 |
| **MSG-CUS-05** | Khách Dine-in | Chủ quán chốt tiền & đóng phiên | *"Đã thanh toán thành công. Cảm ơn quý khách!"* | — |

---

## 4. Danh mục Tuyệt đối CẤM đọc (Negative Security Constraints)

Để đảm bảo an toàn thông tin, bảo mật giao dịch và sự tôn trọng không gian riêng tư của khách hàng, các thông tin sau **TUYỆT ĐỐI KHÔNG ĐƯỢC ĐƯA VÀO CÂU ĐỌC DƯỚI BẤT KỲ HÌNH THỨC NÀO**:

```
[ BẢO MẬT TUYỆT ĐỐI - KHÔNG ĐỌC BẰNG GIỌNG NÓI ]
  ❌ KHÔNG ĐỌC: Mã PIN bàn 6 chữ số (e.g. "482 619") -> Nguy cơ lộ PIN cho bàn bên cạnh.
  ❌ KHÔNG ĐỌC: Mã nhận món 6 chữ số (e.g. "012 345") -> Nguy cơ bị kẻ gian nghe trộm và nhận đồ thay.
  ❌ KHÔNG ĐỌC: Mã phiên, Session ID, Order UUID, Access Token, URL QR.
  ❌ KHÔNG ĐỌC: Số tài khoản ngân hàng, tên chủ tài khoản, mã tham chiếu ngân hàng.
  ❌ KHÔNG ĐỌC: Chi tiết danh sách từng món ăn kèm đơn giá (tránh ồn ào và dài dòng).
  ❌ KHÔNG ĐỌC: Số điện thoại hoặc danh tính cá nhân của khách hàng.
```

---

## 5. Cơ chế Phối hợp Toast + Voice & Tối ưu hóa Âm thanh (Audio Orchestration)

### 5.1. Nguyên tắc "Song hành không trùng lặp" (Dual-Channel Harmony)
- **Kênh thị giác (Visual Toast)**: Đóng vai trò ghi nhận vĩnh viễn trong phiên (Persistent record). Toast Sonner nổi lên ngay lập tức khi sự kiện xảy ra, hiển thị trong 4 giây.
- **Kênh thính giác (Voice Speech)**: Đóng vai trò cảnh báo thời gian thực rảnh tay (Hands-free trigger). Giọng đọc phát đồng thời cùng Toast.
- **Không sinh modal/dialog rác**: Tuyệt đối không bật pop-up yêu cầu xác nhận đã nghe xong.

```
[ Sự kiện API: Đơn mới đến ]
        |
        +---> [ Visual Toast: "Có đơn mới tại Bàn 05 (#025)" ] (Hiển thị ngay trên UI)
        |
        +---> [ Voice Hook: Kích hoạt Web Speech vi-VN ] (Đọc câu: "Có đơn mới tại Bàn 5, số 25.")
```

### 5.2. Thuật toán gom nhóm & Điều tiết tần suất (Throttling & Batching)
- **Thời gian chờ gom nhóm (Batching Window)**: `1.5 giây`.
- Khi có đơn mới xuất hiện:
  - Nếu trong vòng 1.5 giây chỉ có **1 đơn**: Đọc chi tiết đơn theo mẫu `MSG-OWN-01` hoặc `MSG-OWN-02`.
  - Nếu trong vòng 1.5 giây có **từ 2 đơn trở lên**: Hủy các câu đọc đơn lẻ, gom lại và chỉ đọc 1 câu tổng hợp duy nhất: `MSG-OWN-03` (*"Có {count} đơn mới trong hàng đợi"*).
- **Hàng đợi đọc tuần tự (Speech Queue FIFO)**: Nếu có 2 sự kiện khác loại nhau (ví dụ: 1 đơn mới + 1 bàn yêu cầu thanh toán), hệ thống xếp hàng đọc lần lượt, cách nhau **0.5 giây**, không để 2 giọng nói đè lên nhau.

---

## 6. Tiêu chí Nghiệm thu Thiết kế (Acceptance Checklist cho Pha IMPLEMENT)

Tất cả các mục dưới đây là căn cứ bắt buộc để nghiệm thu khi bước vào pha cài đặt code thực tế:

- [ ] **1. Giới hạn mã nguồn & nghiệp vụ**:
  - Không sửa đổi logic đặt món, thanh toán VietQR, thuật toán FIFO `claimNextOrder`.
  - Không tự sinh sự kiện giả lập (synthetic events) ở phía client.
- [ ] **2. Phân định quyền sở hữu âm thanh**:
  - Khách hàng (Customer) luôn luôn ở trạng thái **TẮT mặc định 100%**.
  - Chủ quán (Owner) có quyền bật/tắt chủ động và lưu cài đặt riêng cho thiết bị của mình.
- [ ] **3. Chống đọc lặp & Bão sự kiện**:
  - Không phát âm thanh cho snapshot dữ liệu khởi tạo lần đầu (Initial Load / F5).
  - Không đọc lại các sự kiện cũ quá 120 giây sau khi mất mạng rồi có lại.
- [ ] **4. Bảo vệ dữ liệu nhạy cảm**:
  - Đã kiểm tra 100% câu đọc: Không chứa mã PIN bàn, mã nhận món 6 số, số tài khoản, token.
- [ ] **5. Khả năng tự phục hồi (Graceful Degradation)**:
  - Khi trình duyệt không hỗ trợ Web Speech API hoặc không có voice `vi-VN`: Hệ thống Toast trực quan vẫn hoạt động trơn tru 100%, giao diện không phát sinh lỗi crash.
- [ ] **6. Chuẩn thiết kế Minimal Emerald**:
  - Nút bật/tắt âm thanh dùng icon `Volume2`/`VolumeX` từ `lucide-react`, tông màu emerald `#35977D`, bo góc mềm mại, đạt chuẩn touch target >= 44px.

---

*Hết tài liệu đặc tả thiết kế. Dừng ở bước Audit & Spec theo yêu cầu — Chờ phê duyệt trước khi tạo prompt Implement.*
