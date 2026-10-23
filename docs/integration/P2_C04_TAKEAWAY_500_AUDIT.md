# Audit lỗi 500 khi tạo QR mang đi

23/10/2026, Asia/Saigon. Kiểm tra trên server đang chạy `http://localhost:3000` và Supabase được cấu hình thực tế trong `.env.local`. Không thay .env, migration remote, UI hoặc dữ liệu QR khi audit; không suy luận trạng thái hosted từ test local.

## Nguyên nhân trực tiếp đã tái hiện

`.env.local` thiếu `APP_BASE_URL`. Gọi chính endpoint POST bằng owner Auth thật và body hợp lệ `{requestId:<UUID>,action:'create',type:'takeaway',tableId:null}` trả:

```json
{"data":null,"error":{"code":"INTERNAL_ERROR","message":"Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.","details":{"field":"APP_BASE_URL"}}}
```

HTTP500. Owner GET `/api/owner/qr-codes` cũng trả cùng field cấu hình. Trong `src/server/qr/service.ts`, `writeOwnerQr()` gọi `qrBaseUrl()` trước RPC; `src/server/qr/public-url.ts` bắt buộc cấu hình trusted origin và throw ApiFault khi thiếu. Vì vậy POST lần audit chưa tới transaction tạo QR. UI chỉ hiển thị generic message, không hiển thị details.field, khiến lỗi cấu hình trông như dịch vụ bị gián đoạn.

## Blocker database tiếp theo

Read-only probe trên Supabase đang dùng (service key giữ kín):

| Probe | Kết quả |
| --- | --- |
| RPC `p2_table_qr_execute`, action `qrs`, scope từ membership thực | `PGRST202`: function không có trong schema cache |
| SELECT `qr_codes.retired_at` | `42703`: cột không tồn tại |

Đây là bằng chứng schema trên project đang dùng chưa có đầy đủ migration006; không chỉ là lỗi cache RPC. Bổ sung APP_BASE_URL đơn lẻ sẽ qua được lỗi đầu nhưng tiếp tục gặp500 khi gọi RPC. Test P2-C04 trước đó chạy trên Supabase local riêng, không chứng minh project `.env.local` đã migrate.

## UI đang báo nhầm trạng thái thiếu QR

SELECT read-only theo đúng membership owner cho thấy **1 QR takeaway active đã tồn tại**. Không xuất mã/ID hay token trong báo cáo.

`src/components/owner/OwnerShell.tsx` khởi tạo `qrCodesList=[]`; effect nạp danh sách có điều kiện `activeTab === 'tables'`. Tab Cài đặt nhận `initialQrCode` từ array này, không tự tải danh sách khi mở trực tiếp. Kết quả là UI có thể hiển thị “Quán chưa tạo mã QR” dù DB đã có. Các GET500 hiện tại cũng khiến list không được cập nhật.

Sau khi sửa cấu hình/migration, nếu vẫn gửi create thay vì dùng QR hiện có, R18 đúng contract sẽ trả409 `INVALID_STATE_TRANSITION`, `details.field=activeQr`; không nên giải quyết bằng cách rotate/xóa QR cũ hoặc bỏ unique guard.

## Trình tự khắc phục

1. Cấu hình `.env.local` cho môi trường dev hiện tại: `APP_BASE_URL=http://localhost:3000`. Deployment thật dùng HTTPS với domain public chính thức. Không lấy Host/X-Forwarded-Host làm fallback.
2. Chạy read-only preflight và áp dụng nguyên `supabase/migrations/20261023000600_owner_table_qr_lifecycle.sql` trên đúng Supabase đang cấu hình, sau001–005. Xem [P2_C04_MIGRATION_PREFLIGHT.md](P2_C04_MIGRATION_PREFLIGHT.md). Service-role key không thay thế quyền SQL admin để chạy DDL.
3. Restart server, xác nhận owner GET QR200 và QR takeaway đang có được trả về. Giữ QR cũ ổn định.
4. UI Gemini: nạp QR khi vào Cài đặt, có loading/error riêng; chỉ hiển thị empty sau GET200 không có QR active. Chọn takeaway active, không lấy tùy tiện bản ghi inactive/retired đầu tiên. Khi create409 activeQr thì refetch danh sách thay vì báo chưa có QR.

Audit chỉ xác định nguyên nhân và trình tự sửa; chưa apply migration/config hoặc nghiệm thu lại thao tác sau sửa. Không cần thay transaction tạo QR để xử lý lỗi500 này.
