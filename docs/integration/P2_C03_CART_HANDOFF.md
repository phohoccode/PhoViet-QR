# P2-C03 — Cart domain handoff cho Gemini

Ngày 23/10/2026. **Domain DONE; nối UI do Gemini thực hiện.** Có store/reducer/hook dùng chung dine_in và takeaway; chưa tạo đơn, payment hoặc FIFO. Không chỉnh UI/page/mocks/styles/API/migrations/package/config/env trong task này.

**Cập nhật sau P2-C03:** Chủ dự án yêu cầu sửa API gọi lặp tại `/q/[code]` sau khi UI đã nối facade. Luồng tải QR/menu và error/loading hiện do một cart store sở hữu; container không fetch GET riêng. Đọc [QR_REQUEST_LOOP_AUDIT.md](QR_REQUEST_LOOP_AUDIT.md) cho nguyên nhân, cooldown429, dedupe/StrictMode và kết quả kiểm tra mới. Các ghi nhận “UI chưa nối”/số tests bên dưới là mốc bàn giao P2-C03 ban đầu.

## 1. Imports và vòng đời

```tsx
'use client';
import { useState } from 'react';
import {
  createCartStore, useCart, formatVnd,
  type AddCartLineInput, type CartContext, type DraftCartLine,
  type CartView, type CartIssue, type CheckoutReadiness,
} from '@/features/cart';

// Parent dùng <CustomerCartBoundary key={qrCode} qrCode={qrCode} />.
// Một store ổn định cho mỗi QR; không tạo lại ở mỗi render.
function CustomerCartBoundary({ qrCode }: { qrCode: string }) {
  const [store] = useState(() => createCartStore({ qrCode }));
  const cart = useCart(store);
  // Nối ItemDetail/CartSheet qua các event bên dưới.
  const subtotalLabel = !cart.view.hydrated ? 'Đang tải giỏ'
    : cart.view.estimatedSubtotalVnd === null ? 'Không tính được tổng tạm tính'
    : formatVnd(cart.view.estimatedSubtotalVnd);
  return <span>{subtotalLabel}</span>;
}
```

Subtotal `null` phải hiển thị lỗi overflow và chặn review, **không** hiển thị 0.

Hook trả `state,view,checkoutReadiness`, `addLine,updateQuantity,updateOptions,updateNote,removeLine,clear,refresh,reconcileWithMenu,applyResolution,confirmReview,confirmContextChange,prepareOrderDraft`. Methods trả `CartResult = {ok:true,value}|{ok:false,issue}`; hiện lỗi từ result cho khách, không giả success. `state.lastIssue` cũng có lỗi mutation gần nhất. `state` là snapshot chỉ đọc theo convention; luôn dùng methods thay vì mutate trực tiếp.

Store có thêm `initialize,getState,getServerSnapshot,subscribe,getView,getCheckoutReadiness,markStale,setOnline,dispose`. Default adapter dùng R01/R03 thật từ `@/features/customer/api-client`, không mock fallback. Không gọi `dispose()` trong effect cleanup React StrictMode; hook đã dọn listeners và invalidate request bằng `markStale()`.

## 2. ItemDetail → addLine; CartSheet → edit/remove

```tsx
import type { SelectedItemPayload } from '@/components/customer/ItemDetailSheet';

function onAddToCart(payload: SelectedItemPayload) {
  // Project rõ ràng; không spread payload vì có previewTotalVnd từ UI.
  const result = cart.addLine({
    menuItemId: payload.menuItemId,
    quantity: payload.quantity,
    optionIds: payload.optionIds,
    note: payload.note ?? null,
  });
  if (!result.ok) { /* hiển thị result.issue.message; giữ sheet */ return; }
  // Chỉ đóng sheet/báo đã thêm khi result.ok.
}

// updateQuantity là số lượng TUYỆT ĐỐI, không phải delta của adapter UI cũ.
const increment = (line: DraftCartLine) => cart.updateQuantity(line.lineKey, line.quantity + 1);
const changeNote = (line: DraftCartLine, note: string) => cart.updateNote(line.lineKey, note);
const changeOptions = (line: DraftCartLine, ids: string[]) => cart.updateOptions(line.lineKey, ids);
const remove = (line: DraftCartLine) => cart.removeLine(line.lineKey);
```

Mỗi action cần xử lý `CartResult`. Quantity0 không tự remove: gọi `removeLine` khi khách xác nhận xóa. Note/options đổi có thể đổi `lineKey` và merge; đọc dòng/key mới từ snapshot sau action trước khi thao tác tiếp. Không tái dùng key cũ cho nhiều update của một form; nếu UI cần save đồng thời nhiều fields, adapter phải quản lý key mới/merge đúng, không assume các lệnh trên là transaction.

Chuẩn contract: `CartLine {menuItemId,quantity,optionIds,note:string|null}` giữ nguyên. `DraftCartLine` thêm lineKey/snapshot/noteNeedsReview; `CartView` có lines/itemCount/estimatedSubtotalVnd/currency/isEmpty/requiresReview/issues/hydrated. [Addendum](../contracts/P2_C03_CART_ADDENDUM.md) và `src/features/cart/types.ts` mô tả đầy đủ.

Gộp bằng item ID + option IDs sorted + note trim/loại control chars, phân biệt hoa/thường. Giới hạn99phần/dòng,100dòng,9900phần toàn giỏ,50options/dòng,500ký tự note. Không nhận price/total/UI MenuItem làm nguồn giá; unknown fields bị reject. Options additive, không nhóm/exclusive/required. Số tiền là integer VND và kiểm safe integer.

## 3. Refresh/reconcile và bước xem lại

```tsx
// Khi khách bấm xem lại: luôn lấy R01 + R03 mới trước.
async function onOpenReview() {
  const result = await cart.refresh();
  if (!result.ok) { /* hiện lỗi mạng, giữ cart */ return; }
  // Render snapshot mới, các warnings và giá proposed cho khách xem.
  // KHÔNG tự gọi confirmReview sau fetch.
}

// Nếu container đã có R03 DTO thật cùng QR, có thể dùng:
// cart.reconcileWithMenu(menuV1View);
// Vẫn cần R01 mới trước review; refresh() là lựa chọn đầy đủ.

function onUserAcceptsCurrentPreview() {
  const result = cart.confirmReview();
  if (!result.ok) { /* hiện result.issue, sửa/xóa món lỗi */ return; }
  const readiness = store.getCheckoutReadiness();
  if (readiness.status !== 'ready_to_review') { /* dẫn tới verify/lỗi */ return; }
  const draft = store.prepareOrderDraft();
  // Chỉ preview draft. Không fetch POST, không sinh clientRequestId ở Phase2.
}
```

Giá/revision đổi: giữ snapshot cũ và expose `proposedUnitPriceVnd`; `confirmReview()` mới chấp nhận giá/revision mới. Món/option mất hoặc hết: giữ nguyên intent, yêu cầu sửa/xóa, không confirm được. Invalid/owner-shaped menu làm snapshot stale, không checkout. Total overflow→null và chặn, không tự clamp.

| Trạng thái | Bàn dine_in | Mang đi takeaway |
| --- | --- | --- |
| `empty` | Không có dòng | Không có dòng |
| `menu_refresh_needed` | Offline/chưa hydrate/R01 hoặc R03 stale, cần refresh | Tương tự |
| `cart_invalid` | Review giá/menu/note/context; item/option lỗi; quán pause; checkout_pending | Review giá/menu/note; item/option lỗi; quán pause |
| `verify_table_session` | R01 table `requiresSessionCode:true,session:null`, sau khi các gate trước đã qua | Không áp dụng |
| `ready_to_review` | R01 mới có `requiresSessionCode:false,session:{id,status:'open'}`, cart hợp lệ | QR takeaway hợp lệ, cart hợp lệ; chỉ xem lại |

Thứ tự gate: empty → freshness/online → cart review → pause → table verification/status → ready. Có nhiều vấn đề thì UI đọc issues sửa lần lượt; `requiresReview=false` chưa đủ kết luận ready, phải đọc `checkoutReadiness`.

Sau R02 verify, gọi `refresh()` để đọc R01 thực; hoặc `applyResolution(actualR02Response)` với DTO backend thật cùng QR. Không có setter `verified=true`, không lấy boolean từ storage/mock làm authorization. Server Phase3 luôn kiểm HttpOnly guest scope và session lại. `ready_to_review` không là paid/accepted/ticket/canSubmitOrder.

## 4. Storage, QR/session và offline

- `sessionStorage` v1 scope public storeId/qrCode/orderType/tableId; factory mới theo QR, giữ key riêng. Không migrate key UI tạm `pv_qr_cart_items_v1` vì payload không validate/scope, có note/display fields. Không merge giỏ giữa QR/bàn/quán/mode.
- UUID session bàn chỉ giúp phát hiện context đổi; không bí mật, không là quyền. Cùng bàn nhưng session mới: giữ cart và chặn bằng `CART_CONTEXT_CHANGED`; khách chọn `confirmContextChange()` hoặc `clear()`, rồi review. Không tự confirm.
- Factory/render SSR không window/fetch/storage. Hook hydrate sau mount, refresh khi online/visible; QR resolve trước menu tránh guest-cookie race. Late responses của request cũ bị bỏ qua. Khi cold offline chưa có R01 tin cậy thì chưa restore storage; reconnect để hydrate đúng scope.
- Storage strict schema/version/64KiB/limits/scope, từ chối duplicate canonical lines. Corrupt→bỏ qua và cảnh báo; quota/denied→RAM + `STORAGE_UNAVAILABLE`. UI cần báo “Có thể mất giỏ khi tải lại”. Giỏ RAM vẫn chỉnh note/quantity/remove được khi offline; add/options cần menu fresh. Readiness luôn chặn khi offline.
- **Note chỉ giữ trong RAM**, không persist vì có thể chứa PII. Không lưu labels/images/lineKey/auth/cookie/secret/code/payment/order state. Reload giữ dòng với `noteNeedsReview:true`; yêu cầu nhập lại note hoặc chủ động bỏ bằng `updateNote(key,null)`. Các dòng có note cũ vẫn tách riêng cho đến quyết định; không auto-drop/confirm. Giá/revision lưu cũ cũng không làm ready: fresh API + explicit review bắt buộc.
- Không clear chỉ vì mở checkout/review. `clear()` dành cho thao tác khách xóa giỏ; Phase3 sau này chỉ clear sau server xác nhận tạo đơn thành công.

## 5. Việc Gemini cần nối và giới hạn hiện tại

Các file `src/components/customer/**`, `src/lib/mocks/ui-preview.ts`, `tests/ui/cart/**` đang được Gemini sửa đồng thời. Không thuộc thay đổi Codex. UI hiện vẫn dùng `usePresentationCart` có `WAITING_FOR_CODEX`; **chưa nghiệm thu tích hợp domain thật end-to-end**.

Gemini thay adapter UI tạm bằng facade trên, map `lineKey→lineId` nếu cần, names/options từ `CartLineView` và ảnh từ menu hiện hành. Không tái sử dụng price helpers/readiness/persistence của adapter tạm làm logic chính. `CustomerCartState.subtotalVnd:number` hiện không biểu diễn overflow null; cần mở rộng display handling. `canSubmitOrder` giữ disabled tại Phase2. Readiness boolean và storage scope/note behavior UI tạm không phải contract mới.

Tại lần kiểm tra19:34 ngày23/10, `CustomerQRContainer.tsx:109` có TS2367 do kiểm tra thừa hai discriminators. Trong lúc Codex hoàn thiện handoff, Gemini đã đổi thành `resolution?.type === 'takeaway'`; chạy lại typecheck/build đều PASS. Codex không chỉnh file này. Các báo cáo P2-G03 mới xuất hiện đã được đọc; mô tả “hoàn toàn tương thích” trong handoff UI không thay thế bước nối facade: hiện vẫn import `usePresentationCart`, schema/null totals, note normalization/persistence và readiness còn khác như lưu ý ở trên.

Không có CONTRACT_GAP chặn P2-C03. Exclusive/required options vẫn cần contract mới nếu muốn mở rộng. Không đổi wire types/routes; `OrderDraft` giữ `menuRevision` chính thức và `note:null`, bỏ `clientRequestId` cho Phase3 bổ sung sau.

## 6. Files và kiểm chứng thực tế

Codex thêm:

- `src/features/cart/{types,domain,storage,store,use-cart,index}.ts`.
- `src/lib/validations/cart.ts`.
- `tests/unit/cart/{fixtures,domain.test,storage-store.test,contract-fixtures.test}.ts`, `vitest.config.mts`.
- `docs/contracts/P2_C03_CART_ADDENDUM.md`, `docs/contracts/fixtures/cart-scenarios.json`.
- File handoff này. Không đổi schema DB, API, env, dependencies hoặc wire `types.ts`.

Fixtures: `menu-public.json` canonical R03; `cart-scenarios.json` chứa bàn unverified/verified/takeaway, note khác nhau, món hết, thay giá/bỏ option. Unit tests parse fixtures thật; không chứa credential/PII. Tests gồm merge/edit/remove/limits, safe integer/zero, reconcile/review, verification/session/context, storage corrupt/scope/PII/quota/tamper/duplicates, async stale race, SSR hook render và draft whitelist.

| Lệnh | Kết quả |
| --- | --- |
| `npm exec -- vitest run --config tests/unit/cart/vitest.config.mts` | PASS32/32 |
| `npm exec -- vitest run --config tests/unit/vitest.config.mts` | PASS47/47 (cart + QR/menu regression) |
| `npm exec -- eslint src/features/cart src/lib/validations/cart.ts tests/unit/cart --max-warnings=0` | PASS |
| `npm run lint` | PASS toàn repo tại lần chạy cuối19:39 |
| `npm run typecheck` | PASS sau khi Gemini sửa lỗi UI TS2367 |
| `npm run build` | PASS compile, TypeScript và12/12static pages |
| `git diff --check` | FAIL: trailing blank line EOF `src/lib/mocks/ui-preview.ts:697` của Gemini; không chỉnh hộ |
| UI/browser cart E2E | NOT_RUN: chưa nối facade vào UI Gemini |

Không tuyên bố client tests bảo vệ chống gian lận giá; Phase3 mới có validation/repricing server transactional.

## 7. Acceptance và bước tiếp theo

- [x] Domain/store/hook typed dùng chung2modes, không submission/payment/FIFO.
- [x] Add/edit/remove/merge, limits, tiền nguyên VND kiểm overflow.
- [x] QR scope, SSR hydration, corrupt/error storage fallback, privacy notes.
- [x] Reconcile menu/option/availability/price/revision, explicit confirmation.
- [x] Session backend DTO, không giá/secret trong draft.
- [x] Tests chạy thật, ghi đúng kết quả lint/typecheck/build và phần UI chưa tích hợp.
- [x] Handoff đủ imports/types/events/fixtures và không chỉnh file UI Gemini.

Next: Gemini nối facade và sửa lỗi UI nêu trên; Phase3 triển khai server-side order validation/idempotency/FIFO sau, **chưa triển khai ở đây**.
