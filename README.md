# Phở Việt — Đặt món bằng QR

![Phở Việt — Quét QR, xem thực đơn và đặt món](public/social/share-1200x630.png)

**Quét mã. Chọn món. Theo dõi đơn ngay trên điện thoại.**

Phở Việt giúp quán ăn phục vụ khách tại bàn và khách mua mang đi trên cùng một hệ thống. Khách không cần cài ứng dụng hay tạo tài khoản; chủ quán quản lý mọi hoạt động trong một dashboard.

## Trải nghiệm dành cho khách

| Tại bàn | Mang đi |
| --- | --- |
| Quét QR và nhập mã phiên bàn | Quét QR tại quầy |
| Xem thực đơn, chọn món và tùy chọn | Chọn món và thanh toán qua payOS |
| Gửi đơn, gọi thêm trong cùng phiên | Nhận số thứ tự khi thanh toán được xác nhận |
| Theo dõi món và xem biên lai sau thanh toán | Theo dõi đơn và dùng mã nhận món khi lấy hàng |

## Một dashboard cho chủ quán

- **Đơn hàng:** hàng đợi FIFO chung, nhận đơn tiếp theo và cập nhật tiến độ chế biến, giao món.
- **Bàn:** tạo bàn, quản lý QR, mở phiên và thanh toán cuối phiên; archive bàn trống mà vẫn giữ lịch sử.
- **Menu:** quản lý danh mục, món, giá và tùy chọn; bật/tắt bán, đánh dấu hết hàng và tải ảnh từ thiết bị.
- **Cài đặt:** tạm ngừng hoặc mở lại việc nhận đơn, độc lập cho khách tại bàn và khách mang đi.

## Những chi tiết giúp quán vận hành yên tâm

- Đơn mang đi chỉ vào hàng đợi sau khi backend xác nhận thanh toán.
- Thử lại yêu cầu hoặc webhook lặp không tạo thêm đơn, giao dịch hay số thứ tự.
- Tên món, giá và tùy chọn được lưu theo thời điểm đặt; thay đổi menu không làm đổi hóa đơn cũ.
- Xóa bàn hoặc món bằng archive để giữ dữ liệu lịch sử.
- Ảnh JPEG, PNG, WebP tối đa 5 MiB được kiểm tra và chuẩn hóa trước khi lưu trên Supabase Storage.

## Công nghệ

Next.js App Router · React · TypeScript · Tailwind CSS · Supabase PostgreSQL, Auth & Storage · payOS.

## Phát triển

Dùng Node.js và npm theo phiên bản trong [package.json](package.json). Cài dependencies và tạo cấu hình trên PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Điền cấu hình Supabase, tài khoản chủ quán và các khóa cần thiết theo [.env.example](.env.example), sau đó chạy:

```powershell
npm run dev
```

Ứng dụng mở tại [localhost:3000](http://localhost:3000); đăng nhập chủ quán tại [/login](http://localhost:3000/login). Cơ sở dữ liệu cần được áp dụng migrations theo thứ tự trước khi sử dụng các tính năng tương ứng.

Hướng dẫn môi trường local: [Supabase & Auth](docs/integration/P1_C03_PHASE2_READINESS.md) · [Khởi tạo chủ quán](docs/integration/P1_C02_AUTH_HANDOFF.md). Cấu hình local hiện tắt Storage; xem [hướng dẫn upload ảnh và triển khai](docs/reports/OWNER_HF01_CODEX_REPORT.md) khi cần kiểm tra tính năng này.

## Tài liệu kỹ thuật

- [Yêu cầu sản phẩm](PRD.md)
- [Kiến trúc hệ thống](ARCHITECTURE.md)
- [API và dữ liệu](docs/contracts/API_CONTRACT_V1.md)
- [Archive bàn, menu và upload ảnh](docs/contracts/OWNER_HF01_CONTRACT.md)
- [Biên lai sau khi đóng phiên](docs/contracts/P5_CLOSED_SESSION_RECEIPTS.md)
