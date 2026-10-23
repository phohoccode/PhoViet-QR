# P2-C03 — Client cart contract

23/10/2026. Phạm vi: client draft dùng chung QR bàn và QR mang đi; không có cart DB/API, order submission, payment hoặc FIFO.

## Nguồn dữ liệu và exports

Canonical wire types vẫn ở `docs/contracts/types.ts`, alias `@contracts`. Không đổi `CartLine`, `QRResolution`, `MenuV1View` hoặc `CreateOrderV1Input`. Local types và facade mới export qua `@/features/cart`; schemas ở `src/lib/validations/cart.ts`. Hướng dẫn nối UI: [P2_C03_CART_HANDOFF.md](../integration/P2_C03_CART_HANDOFF.md).

- `CartContext`: discriminated union theo `orderType`; gồm `storeId`, public `qrCode`, `tableId:string` khi dine_in, `tableId:null` khi takeaway. Lấy từ R01; không là bằng chứng authorization.
- `DraftCartLine extends CartLine`: thêm `lineKey`, `snapshot:{basePriceVnd,options:{id,priceDeltaVnd}[]}`, `noteNeedsReview`. Display names chỉ resolve trong RAM từ R03.
- `CartLineView`: thêm `name:string|null`, `optionNames:string[]`, `estimatedLineTotalVnd:number|null`, `proposedUnitPriceVnd:number|null`, `issues`.
- `CartView`: `context`, `lines`, `itemCount`, `estimatedSubtotalVnd:number|null`, `currency:'VND'`, `isEmpty`, `requiresReview`, `issues`, `hydrated`. `null` tiền nghĩa overflow/không tính an toàn, không được map thành 0.
- `CartIssue:{code,message,lineKey?}` là lỗi UX local, không mở rộng server `ApiErrorCode`. Chi tiết union ở `src/features/cart/types.ts`.
- `CheckoutReadiness:{status,issues}`: `empty|menu_refresh_needed|verify_table_session|cart_invalid|ready_to_review`. `ready_to_review` chỉ cho xem lại bản nháp.
- `OrderDraft=Omit<CreateOrderV1Input,'clientRequestId'>`: chỉ `qrCode,menuRevision,items,note`. `prepareOrderDraft()` là pure selector có gate readiness, không gửi HTTP, không sinh request ID, không chứa price/context/session ID/token.

## Intent, giá và review

Quantity integer1–99, tối đa100dòng và9900phần, tối đa50option IDs, note500ký tự sau trim/loại control chars. Theo contract đã có, không đổi note thành200. Option IDs unique, sorted; UUID thật. Add input strict chỉ `menuItemId,quantity,optionIds,note?`; unknown price/preview fields bị từ chối. Options additive độc lập theo P2-C02, không group/min/max/required mới.

Line key là JSON tuple itemID + sorted options + normalized note; note phân biệt hoa/thường. Cùng key gộp số lượng nhưng từ chối toàn thao tác nếu vượt99. Note/options edit có thể đổi key và gộp với dòng khác. Tiền integer VND từ menu snapshot, tổng bằng phép cộng/nhân safe integer; giá0 hợp lệ.

Menu revision hoặc giá đổi cần user review và `confirmReview()`. Giá cũ giữ ở preview, giá đề xuất có riêng; item/option mất/hết không bị tự xóa/thay. Hidden category/item được public API lọc nên xuất hiện như missing. Owner DTO/shape sai làm menu stale. `getCheckoutReadiness()` còn kiểm tra fresh R01/R03, online, store pause, session unverified/checkout_pending và context change. Các flag này phục vụ UX; Phase3 phải authorize/validate/reprice transactionally trên server.

## Storage v1 và quyền riêng tư

`sessionStorage`, scope key `qr-cart:v1:` + encoded JSON tuple `[storeId,qrCode,orderType,tableId]`. Mỗi tab độc lập; QR/table/store/mode khác tách key, không nhập chung giỏ. Session UUID không bí mật chỉ để phát hiện đổi phiên cùng bàn; không cache mã phiên/cookie/guest token hoặc flag verified. Đổi session yêu cầu `confirmContextChange()` hoặc clear trước khi đi tiếp.

Payload whitelist public context IDs, item/options IDs, quantities, numeric preview, opaque menu revision, nonsecret session ID, context review flag và `noteOmitted`. Không ghi tên/ảnh/lineKey/note text/PII/auth/payment/order status. **Note text chỉ trong RAM** vì có thể chứa PII. Sau reload, mỗi dòng có note cũ được giữ riêng với `noteNeedsReview=true`, key tạm; UI yêu cầu nhập lại note hoặc xác nhận bỏ bằng `updateNote(key,null)`. Không được âm thầm bỏ note hoặc auto-confirm.

Storage tối đa65536UTF-8bytes, strict schema/version/quantity/option-snapshot/scope validation, từ chối duplicate canonical lines. Dòng note-omitted được giữ riêng có chủ đích. Corrupt bị bỏ qua và cảnh báo; không tin giá/revision/readiness lưu cũ. Restore luôn cần menu thật và explicit review. Storage fail/quota→RAM và cảnh báo; không crash. Empty cart chỉ remove key đang dùng.

SSR không đọc window/storage/fetch trong factory/render. Hook initialize sau mount, refresh khi online/visible; refresh R01 rồi R03 tuần tự tránh race tạo guest cookie. Offline giữ giỏ RAM đã nạp và chặn review; cold offline chưa có scope R01 tin cậy nên chưa hydrate, cần reconnect. Snapshot không là cam kết menu sẽ không đổi sau response.

## Fixtures

- [menu-public.json](fixtures/menu-public.json): canonical R03 envelope; món thường/hết, options additive và giá0.
- [cart-scenarios.json](fixtures/cart-scenarios.json): R01 bàn unverified/verified và takeaway, selection khác note, món hết, thay giá/bỏ option. ID/session trong fixture chỉ public identifiers giả lập, không credentials.
- `tests/unit/cart/contract-fixtures.test.ts` parse fixtures thật và kiểm gates/reconciliation. Fixtures chỉ mô tả dữ liệu; không seed hoặc gọi server.

Không có CONTRACT_GAP chặn domain hiện tại. CR-UI-10 về exclusive/required option groups vẫn ngoài contract. Wire error enums/API routes không thay đổi.
