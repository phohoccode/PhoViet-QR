# Tài nguyên công khai

File trong thư mục này được phục vụ trực tiếp từ đường dẫn gốc của website.

| Đường dẫn | Mục đích |
| --- | --- |
| `/favicon.ico` | Favicon ICO RGBA, gồm cỡ 16, 32, 48 và 64 px |
| `/site.webmanifest` | Khai báo tên ứng dụng, màu và biểu tượng PWA |
| `/brand/logo.png` | Logo dùng trong giao diện |
| `/icons/icon-192.png` | Biểu tượng PWA 192 × 192 px |
| `/icons/icon-512.png` | Biểu tượng PWA 512 × 512 px |
| `/icons/apple-touch-icon.png` | Biểu tượng Apple 180 × 180 px |
| `/social/share-1200x630.png` | Ảnh chia sẻ Open Graph và Twitter |

Metadata và đường dẫn biểu tượng được quản lý trong `src/app/layout.tsx`.
Khi đổi tên hoặc di chuyển ảnh, cập nhật cả metadata, manifest và component
đang sử dụng đường dẫn đó.

Giữ favicon tại `public/favicon.ico`; tránh tạo thêm `src/app/favicon.ico`
trùng đường dẫn. Favicon phải là file ICO hợp lệ, không chỉ đổi đuôi từ ảnh khác.

Ảnh nguồn và các bản xuất chưa dùng trên website nằm trong `assets/brand/source`
và `assets/brand/exports` ở gốc repository.
