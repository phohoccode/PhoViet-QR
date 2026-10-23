# QR Ordering — Minimal High-Performance MVP

> **Bộ đặc tả phát triển website, phiên bản 1.0 · 23/10/2026**  
> Tài liệu bàn giao bằng tiếng Việt, tối ưu cho quy trình **Codex (logic) + Gemini (UI)**.

## 1. Tầm nhìn

Website đặt món qua QR cho quán ăn, cà phê, trà sữa quy mô nhỏ, ưu tiên tốc độ thao tác và thứ tự phục vụ công bằng khi đông khách. Sản phẩm **chỉ có hai giao diện chính**:

1. **Khách hàng** — mobile-first, không đăng nhập, dùng chung cho QR tại bàn (**dine-in**) và QR tại quầy (**takeaway**).
2. **Chủ quán** — đăng nhập, một dashboard kiêm quản lý đơn, chế biến, phục vụ, thu ngân, menu và cấu hình; **không có màn hình riêng cho bếp/nhân viên**.

### Nguyên tắc thiết kế

- **Ít màn hình, ít nút, ít thao tác** nhưng không cắt giảm tính đúng đắn của backend.
- Đặt món trên điện thoại trong vài bước, chú trọng trải nghiệm mạng yếu.
- Mỗi đơn hợp lệ nhận **một số thứ tự FIFO chung** cho cả dine-in và takeaway.
- **Takeaway phải được xác nhận thanh toán tự động trước khi vào hàng đợi chế biến**; dine-in đặt trước, thanh toán cuối phiên bàn.
- Dữ liệu PostgreSQL là nguồn sự thật; realtime chỉ truyền thay đổi để cập nhật nhanh.
- UI bám theo hình tham chiếu: `assets/ui-reference.png` (do người dùng cung cấp).

## 2. Quyết định kỹ thuật đã chốt

| Hạng mục | Lựa chọn |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS, Lucide icons |
| Backend | Next.js Route Handlers + server services |
| Database | Supabase PostgreSQL |
| Đăng nhập | Supabase Auth **chỉ cho chủ quán** |
| Realtime | Supabase Realtime Broadcast / các kênh bảo vệ quyền |
| Validation | Zod ở biên API + ràng buộc SQL |
| Thanh toán takeaway | Adapter payOS hoặc SePay; **chọn một** sau khi xác minh điều kiện tích hợp và webhook |
| Deployment | Vercel + Supabase, có biến môi trường theo môi trường |
| Ngôn ngữ UI | Tiếng Việt, tiền tệ VND, múi giờ `Asia/Ho_Chi_Minh` |
| Tác nhân AI | **Codex**: backend/logic/integration; **Gemini**: UI/UX/components |

Không đóng đinh phiên bản npm trong đặc tả; lúc khởi tạo phải kiểm tra compatibility và pin các bản ổn định vào lockfile.

## 3. Phạm vi MVP — chốt

**Có:**
- Hai loại QR (bàn/quầy); QR bàn yêu cầu phiên bàn hợp lệ.
- Menu, tùy chọn món cơ bản, giỏ hàng, gửi đơn.
- Đơn tại bàn: tạo đơn ngay, gọi thêm, theo dõi trạng thái, thanh toán khi kết thúc.
- Đơn mang đi: tạo yêu cầu trả tiền, hiển thị QR thanh toán, xác nhận tự động, cấp số FIFO, theo dõi, xác minh nhận món.
- Một hàng đợi chung và bảng đơn chủ quán: `Chờ làm → Đang làm → Sẵn sàng → Đã giao`.
- Quản lý bàn (mở phiên, đóng phiên), menu (CRUD tối giản, hết hàng), cài đặt QR/cổng thanh toán.
- Bảo mật, idempotency, xử lý webhook trùng, audit tối thiểu, tình huống mất mạng và thử tải.

**Chưa có:** tài khoản khách, nhân viên nhiều vai trò, dashboard bếp/bar riêng, sơ đồ bàn kéo thả, kho nguyên liệu, tích điểm, khuyến mãi, đa chi nhánh, split bill, thông báo SMS/push, báo cáo nâng cao.

## 4. Cấu trúc tài liệu

| File | Đọc khi nào |
|---|---|
| [`README.md`](README.md) | Bắt đầu: mục tiêu, quyết định, phạm vi |
| [`PRD.md`](PRD.md) | Nắm đầy đủ hành vi sản phẩm, user stories, trường hợp ngoại lệ |
| [`UI.md`](UI.md) | Giao nhiệm vụ cho Gemini: thiết kế, bố cục, màu và trạng thái UI |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Giao nhiệm vụ cho Codex: DB, API, FIFO, payment, bảo mật |
| [`PLAN.md`](PLAN.md) | Các chặng triển khai, điểm giao nhau giữa hai agent |
| [`TASKS.md`](TASKS.md) | Checklist có ID, thứ tự, phụ thuộc, người phụ trách |
| [`assets/ui-reference.png`](assets/ui-reference.png) | Ảnh tham chiếu phong cách của chủ dự án |

## 5. Quy trình làm việc với hai agent

1. Đọc đủ 6 file; coi `PRD.md` là nguồn sự thật về **nghiệp vụ**, `ARCHITECTURE.md` là nguồn sự thật về **data contracts** và `UI.md` là nguồn sự thật về **giao diện**.
2. **Codex** chủ trì schema/migration, API contracts, payment verification, security, queue, integration và tests. Không tự ý thiết kế lại hình thức UI.
3. **Gemini** chủ trì design tokens, responsive layouts, component shadcn/ui, interaction/feedback và accessibility. Chỉ dùng mock data/adapter; **không thay DB, API, FIFO hay luật thanh toán**.
4. Thống nhất shared `types` và interface API trước khi chia nhánh; không để hai agent cùng sửa một file.
5. Sau mỗi chặng, tích hợp, build/lint/test và nghiệm thu bằng checklist `TASKS.md`; không chờ cuối dự án mới ghép.

## 6. Lộ trình tối thiểu để có luồng hoàn chỉnh

`Khởi tạo → QR/phiên bàn → Menu/giỏ hàng → Dine-in order + FIFO → Dashboard owner → Takeaway payment webhook → Theo dõi realtime → Test tải & deploy`.

Dù gọi là MVP, phần thanh toán và cấp số cần **transaction**, **idempotency**, **server-side authorization** và **test đồng thời** trước khi vận hành thật.

## 7. Khởi tạo dự án (tham khảo, chưa phải source code hoàn chỉnh)

```bash
npx create-next-app@latest qr-ordering --typescript --tailwind --eslint --app --src-dir
cd qr-ordering
npx shadcn@latest init
# Bổ sung từng component cần dùng, không cài tất cả
npx shadcn@latest add button card badge sheet dialog tabs input skeleton toast
```

Các lệnh CLI/component có thể thay đổi theo phiên bản thực tế; kiểm tra tài liệu chính thức khi chạy. Chuẩn bị hai môi trường Supabase tách biệt `dev` / `prod`; không đưa thông tin bí mật thanh toán vào client.

## 8. Định nghĩa hoàn thành MVP

- Hai QR đi đến đúng chế độ; khách không login, chủ quán login được.
- Dine-in gửi đơn hợp lệ → nhận ticket → chủ quán thấy ngay → hoàn thành → thanh toán và đóng phiên bàn.
- Takeaway không được chế biến trước khi backend xác nhận tiền; thanh toán hợp lệ → đúng **một** ticket → giao món có xác minh.
- Các thao tác retry/webhook lặp không tạo bản sao; hai yêu cầu đồng thời không sinh ticket trùng.
- Kiểm thử quyền truy cập, mã bàn cũ, các trường hợp lỗi và tải cao đạt ngưỡng được xác định qua đo thực tế.
- Trải nghiệm khách hàng rõ ràng trên mobile, chủ quán theo dõi và xử lý đơn chỉ bằng một dashboard.

> **Quan trọng:** Bộ ZIP này là **tài liệu đặc tả**, không phải mã nguồn website triển khai sẵn. Các giá trị môi trường, nhà cung cấp thanh toán và SLA cụ thể cần chọn/xác thực khi bắt tay tích hợp.
