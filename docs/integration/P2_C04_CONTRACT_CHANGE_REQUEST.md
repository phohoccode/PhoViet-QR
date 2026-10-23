# P2-C04 — CONTRACT_CHANGE_REQUEST

Phạm vi được yêu cầu: quản lý bàn/QR phía backend, không sửa UI hoặc `docs/contracts/types.ts` đã khóa. Đây là đề xuất mở rộng có implementation/test để Gemini tích hợp trong P2-C05; không tuyên bố đã nghiệm thu UI.

## Giữ nguyên v1

- R11 GET `/api/owner/tables?tableId=...` vẫn trả `{tables,detail}`; session và detail giữ shape P2-C01. Thêm `updatedAt`, `qr` vào từng bàn.
- R17 GET `/api/owner/qr-codes` vẫn trả array và tất cả field QRCodeView. Thêm `publicUrl`, `updatedAt`, `retiredAt`.
- R18 POST `/api/owner/qr-codes` dùng nguyên `QRCodeWriteInput`, create 201, set_active 200. Không tạo thêm PATCH QR trùng chức năng. Create khi đã có QR active trả 409; legacy ensure = GET, create khi thiếu, refetch nếu gặp 409.
- Không thêm API đóng phiên, đọc lại/rotate mã phiên, order, payment hoặc realtime.

## Mở rộng đề xuất

Types tại `src/types/contracts/table-qr.ts`: OwnerTable, OwnerQrCode, OwnerTableList, CreateTableInput, UpdateTableInput, RotateQrInput, WriteQrInput. Request dùng UUID `requestId` và không nhận storeId/publicCode.

| Endpoint mới | Input | Kết quả |
| --- | --- | --- |
| POST /api/owner/tables | requestId, label | 201 OwnerTable cùng QR đầu tiên, transaction atomic |
| PATCH /api/owner/tables/:id | requestId, expectedUpdatedAt, label? hoặc active? | 200 OwnerTable |
| POST /api/owner/qr-codes/:id/rotate | requestId, expectedUpdatedAt, confirm:true | 201 OwnerQrCode mới |

`expectedUpdatedAt` phải gửi nguyên chuỗi server (giữ microseconds), không qua Date.toISOString. Replay cùng actor/store/action/payload trả kết quả cũ trước CAS; đổi payload/key đã dùng => 409 DUPLICATE_REQUEST_CONFLICT; actor khác không được replay => 403.

Default policy: chặn disable bàn, disable/rotate QR table khi có phiên open hoặc checkout_pending. Rotate retire vĩnh viễn QR cũ, không cho bật lại; disable thường có thể bật lại. Disable bàn giữ code và QR flag; bật lại bàn phục hồi resolver nếu QR vẫn active. Nhãn chuẩn hóa whitespace, unique không phân biệt hoa/thường trong quán. QR public URL dùng APP_BASE_URL, HTTPS production; thiếu/sai cấu hình => 500 INTERNAL_ERROR details.field=APP_BASE_URL, trước mutation.

## Mapping lỗi theo enum hiện hữu

Không thêm enum lỗi không có trong contract gốc. `details.field` phân biệt:

| Ý nghĩa UI | error.code | field | HTTP |
| --- | --- | --- | --- |
| TABLE_LABEL_CONFLICT | VALIDATION_ERROR | label | 400 |
| ACTIVE_SESSION_EXISTS / QR_ROTATION_BLOCKED | INVALID_STATE_TRANSITION | activeSession | 409 |
| ACTIVE_QR_EXISTS | INVALID_STATE_TRANSITION | activeQr | 409 |
| Bàn inactive | INVALID_STATE_TRANSITION | tableActive | 422 (giữ R18) |
| Dữ liệu cũ | INVALID_STATE_TRANSITION | expectedUpdatedAt | 409 |
| QR đã retire / không rotate được | INVALID_STATE_TRANSITION | retiredQr / rotation | 409 |

Cross-store resource trả 404 RESOURCE_NOT_FOUND để tránh lộ tồn tại; guest 401; authenticated không membership 403. Handoff mô tả đầy đủ request/response và hướng dẫn UI cảnh báo in lại sau rotate.
