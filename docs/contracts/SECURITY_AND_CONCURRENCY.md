# Security and concurrency — v1-draft

Cập nhật 23/10/2026. Đây là đặc tả và **test plan**, không có DB/auth/API/provider/realtime implementation. Đọc cùng API_CONTRACT_V1 R01–R21, DOMAIN_MODEL và STATE_MACHINES. Chỉ guest và owner là actor người dùng; provider/worker là nguồn hệ thống, không role nhân viên.

## 1. Actor → resource → action → kiểm tra bắt buộc

| Actor | Resource | Permitted action | Required check / mặc định deny |
|---|---|---|---|
| Public guest | Active QR locator / menu | Resolve, xem active items/options; unavailable vẫn hiện hết hàng | QR đúng store, không trả sessionId khi chưa verify; publicCode không phải bí mật/quyền order |
| Guest với browser bundle rỗng | POST tạo takeaway | Tạo order pending và nhận grant đúng order | Bootstrap cookie trước submit, origin/CSRF, rate, normalized payload+clientRequestId bound browser; không dùng key để đọc order của browser khác |
| Guest nhập mã phiên | TableSession | Verify và nhận table_session grant | QR gắn đúng bàn, session live, code hash/expiry/code generation đúng; wrong code 422, expired 410; không code URL query/log |
| Guest table_session scope | Session/order thuộc phiên | Submit dine-in khi open; đọc đơn cùng phiên | Cookie opaque hash→grant, store/session/table match, TTL/revokedAt, phiên chưa closed. Token bàn A không có quyền bàn B; checkout_pending chỉ đọc |
| Guest order scope | Một takeaway order và intent của nó | Tracking/payment snapshot, private pickup projection nếu đủ guard | Match chính xác order/intent/store; check TTL/revoke. Ticket/orderId không cấp quyền; outside scope 404 |
| Guest buyer của order paid | PrivateOrderTrackingView.pickup | Xem mã của mình khi accepted/preparing/ready | Query includePickup=true, **order grant riêng**, không owner/table/public fallback; no-store/no-referrer; null khi consumed/hết hạn/terminal |
| Owner Supabase Auth | Store/Orders/Menu/Tables/QR/Settings | Lệnh R07–R20 trong store | Verify Auth server-side + owner_members tại mỗi route. Không lấy request.storeId để cấp quyền. Cross-store 404 với resource, 403 sai membership |
| Owner | Queue accepted | Claim next toàn store | requestId+actor+payload, store claim gate, row lock, chọn thứ tự nhỏ nhất; không orderId/filter/skip row |
| Owner | Đơn preparing/ready | Ready/complete đúng transition | expectedVersion/current state, takeover paid và verify+consume pickup atomic; không chỉ so bằng mắt |
| Owner | SessionSettlement | Begin/cancel checkout, confirm_received đóng bàn | Lock phiên, tổng server snapshots, guard đơn hoàn tất theo Q6, unique success, operation idempotency; revoke cùng commit |
| Owner | Session code delivery | Xem mã mới tạo của đúng lệnh R12 | Private command response, không grid/list/general DTO; encrypted artifact cho replay cần Q5. Mã bị đóng/rotate không hồi sinh |
| Payment provider | Webhook ingress | Gửi evidence thanh toán | Raw-body signature + merchant account + configured provider. Signature valid chưa đủ: còn ref/amount/currency/status/expiry/dedupe |
| Backend expiry/reconciliation worker | Intent/ledger/order/outbox | Expire, giữ evidence, retry publish | Server env/service credentials, cùng locks/constraints. Default webhook-only release, sync không tự queue trước chốt Q1 |
| Realtime subscriber | Owner store / guest order hoặc session | Nhận invalidation và fetch snapshot | Private authorization đúng grant/owner, token realtime hạn ngắn nếu dùng; server recheck. Không public broadcast đơn/mã nhận |

Cookie bundle là transport chứa server-side mapping **nhiều grant độc lập**, không mở rộng scope thành quán. Hash/token/value không có trong JSON DTO, URL hoặc localStorage. P2-HF01 thay chính sách cũ: rotate PIN tăng generation/version, vô hiệu PIN cũ ngay và **giữ nguyên guest grants đã verify**, sessionId và orders. Close vẫn revoke mọi grant. Reveal/rotate là POST owner-only có CSRF/audit; không có revoke-all mới. Tham chiếu R12/P2_HF01_CODEX_PIN_HANDOFF.md.

## 2. Credential và ranh giới dữ liệu

- Supabase service role, provider signing/API keys và encryption/HMAC keys chỉ server env/secret store, tuyệt đối không NEXT_PUBLIC_*, source/client bundle/.env commit. Không kết nối tài khoản/payment thật trong P0.
- Auth cookie dùng HTTPS Secure, HttpOnly, host-only, SameSite phù hợp same-origin; mọi mutation cookie-based kiểm Origin/CSRF, CORS không wildcard credentials. Header không thay thế scope checking. Session fixation: bootstrap cookie crypto-random, rotate an toàn khi auth/verify và giữ mapping cần retry; thao tác rotation không được vô tình bỏ browser binding đang chờ.
- GuestAccess DB lưu hash token, scope và TTL/revoke. Browser binding ban đầu không cấp quyền đọc; tạo order gắn grant server-side **trước khi response**. Khi mất Set-Cookie response không mất quyền vì browser cookie bootstrap đã có. Không tạo order nếu chưa browser binding. Nếu xóa cookie, HTTP 401/403; không gửi key để xin token cũ.
- Session/pickup code cũng hash để verify. Hash không đọc lại plaintext. **ASSUMPTION Q5**: giữ thêm ciphertext được mã hóa bằng server key riêng có AAD scope/store/generation và expiry để giao lại cho đúng người được ủy quyền; ACL hẹp, tách ledger/audit/outbox. Không lưu plaintext trong result_json. Chưa phê duyệt key lifecycle/TTL/migration/format, chặn bật delivery production đến khi chốt. Private types chỉ mô tả boundary, không bịa DB có sẵn ciphertext.
- Session code plaintext chỉ R12 private owner delivery; pickup chỉ R05 includePickup=true buyer scope. Default OrderDetail, TableSummary, OwnerOrdersView, list QR và realtime **không chứa các mã**. Buyer code không phải guest access token; tuyệt đối không dùng TK-prefix/ticket làm thông tin đăng nhập. R10 nhận code là proof transient, không echo code.
- Code có entropy từ CSPRNG và format opaque string, không khóa UI vào PIN 4 số. Tối thiểu độ mạnh, max attempts, TTL, hỗ trợ quên mã phải xác minh trước launch. Dù format cuối ra sao, compare hash constant time, hạn chế attempts, không lộ đúng một phần/length matching.
- Redact request/response body verify/complete/private delivery, Cookie/Authorization/Set-Cookie, URL query credential nếu client gửi sai, provider raw payload. Error chỉ allowlist field/code, không SQL/stack/internal ref/account keys. Raw signed evidence chỉ protected storage với retention cần chốt; structured logs lưu correlation ID (không capability), aggregate ID đã kiểm quyền và outcome.
- Private responses no-store, no service worker cache, no analytics body/screenshot capture chứa mã. QR dynamic không nhúng sessionCode query để tránh history/referrer/server logs. Khách copy link order vẫn phải có grant ở thiết bị nhận; hỗ trợ đổi máy chưa chốt.

## 3. Idempotency có principal binding

Normalize cart: giữ thứ tự line có ý nghĩa, trim note theo quy tắc cố định (null khác text không tự gộp tùy tiện), unique/sort optionIds, normalize field order khi fingerprint. Bao gồm qrCode/menuRevision/items/note và route/operation; không bỏ field ảnh hưởng nghiệp vụ. Không dùng client timestamp để dedupe. Owner complete có code: fingerprint bằng keyed HMAC để không offline brute-force PIN từ hash request. Chỉ lưu sanitized response/protected delivery reference.

| Lệnh | Unique key / binding | Cùng key + payload | Khác payload hoặc principal |
|---|---|---|---|
| Create order | `(store_id,client_request_id)`, bind browser context/guest access | Replay status 201 + snapshot order/intent/ticket đã tạo, không tính lại giá, không counter mới; live grant phải còn hợp lệ | Same browser different fingerprint 409; browser khác 403, không trả order cũ |
| Claim-next | `(store_id,request_id)` + operation/owner | Replay 200 cùng order **hoặc null**; null vẫn là kết quả đã thực hiện, muốn claim mới cần requestId mới có chủ ý | 409 operation/payload mismatch; owner không còn membership 403/401 |
| Ready/complete | Như operation_requests, bao gồm target ID/expectedVersion/type/proof HMAC | Kiểm replay trước stale version/consumed-code guard, trả kết quả cũ an toàn | Key mới sai status/version→409, code sai→422, không đổi đơn |
| Settle | `(store_id,request_id)` + session/action/owner | Cùng kết quả begin/cancel/confirm; unique settlement success/session chặn key khác thu lần hai | Mismatch→409; same session closed với key mới→409 |
| Menu/QR/settings/open session | Operation key + actor + payload | Replay cùng snapshot/ID, không tạo thêm row/revision/code. Private open-code delivery chỉ nếu grant phiên/code còn hiệu lực | Mismatch→409, mất quyền→403, phiên đóng→410, không hồi sinh secret |
| Webhook | `(provider,event_id)` **và** `(provider,provider_tx_id)` | ACK duplicate sau durable processing; same transaction khác event cũng không tạo ledger/ticket hai | Same tx gắn intent khác→evidence exception, không reassign. Payload cùng event ID bị đổi→anomaly, không tin success mới |

Trong progress đồng thời dùng unique reservation/row locks và transaction, không một cờ in-memory. Dedupe record chỉ `processed` sau commit domain changes; worker chết/rollback không để bản ghi “đã xử lý” giả làm mất callback. Replays sau menu edit/store pause vẫn lấy result cũ nếu còn quyền, không rơi vào PRICE_CHANGED vì lệnh đã thực hiện. Errors validation chưa tạo tài nguyên không được dùng thành công giả; retry cùng key cùng payload lỗi vẫn không tạo đơn cho đến khi người dùng xác nhận payload mới. Không tự xoay UUID vì timeout. Retention phải dài ít nhất toàn vòng đời có thể retry/reconcile; không purge event/tx uniqueness để “dọn nhanh”.

## 4. Acceptance, counter và claim công bằng

Acceptance transaction chỉ có DB work, không provider/network I/O. Dine-in: auth+scope session open, lock menu revision/menu snapshot, order/items → ticket counter → acceptedAt DB clock → audit/outbox, commit. Takeaway create: snapshot order/intent pending trước, checkout adapter async/retry ngoài locks; webhook verified mới acceptance.

Counter row key `(store_id,service_date)`, initialize nếu chưa có rồi lock/increment/assign trong cùng transaction. Unique ticket `(store_id,service_date,ticket_no)`. Không MAX()+1, không clock client, không separate Redis/sequence cấp trước commit. AcceptedAt ghi ở điểm acceptance sau lock, không dùng transaction-start timestamp làm thứ tự. Rollback phải rollback cả counter/paid/order; committed cancelled giữ ticket, không reuse. Ngày vận hành tính DB time theo store boundary; nếu đợi qua boundary thì retry đúng ngày. Ngày cũ không bị renumber khi chế biến/giao ngày mới.

Claim transaction: lock store claim gate → recheck operation request → select accepted nhỏ nhất `(service_date,ticket_no,id)` → lock row → preparing + version + audit/outbox + operation result → commit. **Không SKIP LOCKED**, ưu tiên FIFO strict tại lúc bắt đầu cho một owner. Row trước bị khóa phải chờ/retry, không nhảy sang row sau. Filters UI không ảnh hưởng command. Hai owner tab key giống claim một lần; key khác serialized hai đơn liên tiếp. Đơn completed không bị buộc kết thúc theo ticket vì thời gian làm món khác nhau.

Định nghĩa thứ tự là điểm transaction được DB serialize/chấp nhận, không theo lúc client bấm, request đến HTTP hay provider occurredAt. Cùng ngày counter lock ngăn ticket sau commit trước ticket trước. **Boundary qua nửa đêm:** để tránh new-day commit/claim vượt old-day acceptance đang commit, draft thêm store admission gate (cùng lock store với claim) cho transaction cấp ticket; gate trước session/intent/order/counter và giữ tới commit. Counter vẫn là nơi cấp số per-day; gate chỉ đảm bảo thứ tự admission/claim giữa hai ngày. Đây là chi tiết concurrency bổ sung C02, cần đo contention trước pilot, không network trong lock.

Lock order dự kiến thống nhất: reserve operation key (nếu có) → store admission/claim/metadata row (accept/claim/menu/QR/settings mutation) → table session (dine-in/settle) **hoặc** payment intent (webhook/expiry) → order rows theo ID → menu revision/menu rows theo ID (submit/menu edit) → counter → audit/outbox. Menu CRUD lấy store row trước menu rows để update revision/version, không khóa order theo chiều ngược, không webhook lock intent rồi quay lại lấy store gate. Expiry không acceptance thì không cần gate, chỉ intent→order; settle không lấy gate sau session. Rotate/close phải tuân session lock. Deadlock/serialization timeout rollback và retry bounded cùng key, không ACK thành công. Index/constraints/RLS và stress test thực tế thuộc phase sau.

## 5. Webhook verification, expiry và exception

1. Chỉ provider configured, read raw bytes+headers; verify scheme đúng tài liệu chính thức vendor chưa chọn. Không invent cùng HMAC/payOS=SePay, không cookie owner thay chữ ký. Chữ ký valid **và merchant account đúng** mới tiếp tục; raw JSON client tự tạo→401, không order state change.
2. Normalize trusted fields; match merchantRef exact→intent→order/store; validate paid success + amount exact total + currency VND + provider transaction ID. Timestamp provider chỉ audit; default lấy DB expiry guard, success xử lý sau expiry→exception (Q2), không backdate ticket.
3. Trong DB transaction recheck mọi guard vì signature verify ngoài lock không bảo đảm intent còn pending. Success pending hợp lệ ghi ledger, intent succeeded, allocate đúng một ticket, accepted, credential record, version, audit/outbox atomic; thiếu một phần rollback toàn bộ.
4. Replay dedupe event/transaction. Failure/out-of-order sau succeeded không giảm paid, không mất ticket. Giao dịch thứ hai thật vào cùng reference giữ ledger/evidence anomaly, không ticket mới. Client thấy paid vẫn paid của giao dịch hợp lệ đầu, không đánh đồng mọi anomaly là tiền chưa nhận.
5. Unknown ref: evidence protected không gán bừa order; không expose một order đoán từ ref. Mismatch/late match intent chưa accepted→intent exception/order payment_exception/ticket null; no auto accept/refund. Failed/expired → exception nếu verified money đến muộn. Đồng bộ provider khi webhook mất chỉ phát hiện/đối soát theo default Q1, chưa tự cấp ticket.
6. DB failure→500/provider retry. Dữ liệu malformed→400; signature fail→401; durable evidence mismatch/late được ACK recorded_exception 200 nghĩa “đã nhận sự kiện”, không business success. Actual wire schema+ACK/HMAC là PG-01 BLOCKER cần chốt trước Phase 4. Browser pending GET vẫn 200 snapshot, không dựa webhook ACK/return URL để paid.

Expiry worker lock intent→order, recheck DB time/status: webhook thắng→expiry no-op; expiry thắng→cancelled/unpaid ticket null, callback success sau đó→payment_exception. Không cho countdown UI tự cancel/khởi tạo intent mới. Q2 hiện TTL 10 phút đề xuất C01 vs 15 phút đề xuất G01, chưa duyệt; UI chỉ đọc expiresAt. Adapter timeout giữ pending, retry cùng reference ngoài lock, instructions có thể null, không dụ trả tiền hai lần.

## 6. Checkout bàn, bill và revoke

Submit dine-in và begin_checkout/settle cùng lock session. Nếu submit commit trước, checkout phải tính bill bao gồm đơn đó và tăng phiên version. Nếu begin_checkout commit trước, submit mới→409 SESSION_CHECKOUT_PENDING, không ticket. Closed/revoked→410 SESSION_EXPIRED, không reopen bằng code cũ. UI giữ cart, liên hệ owner; “mở lại” nghĩa tạo session ID mới sau closed.

Begin chỉ khóa nhận thêm, không ghi paid; cancel_checkout chỉ nếu chưa success, clear pending attempt, mở lại. Confirm_received dưới lock session + orders tính total non-cancelled snapshot, theo Q6 mọi non-cancelled completed; client chỉ gửi method/confirmation, không tổng đáng tin. Tạo một settlement succeeded unique/session + closed + revoke **mọi grant phiên** + tăng version phiên/derived payment order + audit/outbox cùng commit. Hai request cùng key replay; key khác second→409, không double settle. Succeeded terminal, không xóa audit. Nếu giữ encrypted session credential, close làm delivery vô hiệu cùng commit; no code recovery cho phiên cũ.

## 7. Realtime, reconnect và polling

- Outbox ghi cùng transaction, phát sau commit, worker retry at-least-once với eventId. Invalidation event chỉ `eventId,aggregateId,version,type`; không pickup/session code, token, items, paid evidence, account. Owner private store channel theo membership, guest đúng order/session channel theo grant. Không dùng public Supabase table broadcast có dữ liệu order.
- UI dedupe eventId/version, fetch snapshot theo endpoint quyền hiện có. Event đến sau GET hoặc đảo thứ tự không được overwrite version mới bằng cũ. Reload/page-visible/reconnect refetch kể cả chưa có event; mutation replay snapshot cũ không đè GET mới.
- Version event có namespace theo aggregate: order/session dùng version DB hiện hữu; menu/QR/settings dùng store.id và internal stores.version tăng cùng transaction metadata mutation. Không so version của hai aggregate khác nhau hoặc dùng menuRevision làm số ticket; StoreSettingsView.updatedAt là precondition riêng của editor, không event version.
- **ASSUMPTION polling:** payment mỗi 3–5 giây; tracking 5–8 giây; owner 5 giây khi WebSocket mất; jitter và exponential backoff tối đa 30–60 giây, dừng khi tab ẩn/offline, resume snapshot khi visible/online. Không cam kết throughput chưa đo; limit counts phải phù hợp polling, không dùng 15 phút cứng làm điều kiện dừng kiểm tiền cuối cùng.
- Closure private event chỉ invalidation; request tiếp bị revoke thì UI đóng quyền xem, giữ cart cục bộ không có secret. Offline không tự tạo success, không queue lệnh tài chính mới trong service worker; khi có mạng retry cùng command ID.

## 8. Rate limits có xét Wi-Fi chung

Các profile là đề xuất cần tune load test, không số SLA đã đo. Trả 429 + Retry-After + details.retryAfterSeconds, client backoff, giữ nguyên key. Không count idempotent replay đã auth như create mới tốn provider/counter. Chặn brute-force chủ yếu theo QR/session/order+browser, không ban cả IP Wi-Fi quán vì một máy sai.

| Profile | Route | Key / đề xuất chưa duyệt |
|---|---|---|
| P-read | R01/R03 | Browser+QR 60/phút, IP/store soft ceiling cao hơn; cache public menu đúng scope, không cache grant |
| Verify | R02 | Browser+QR 5 sai/phút, session/QR rolling cap và IP anomaly detection; không khóa vĩnh viễn mọi khách chung QR/IP |
| Create | R04 | Browser/scope+store 10 đơn mới/phút, payload size <=64 KiB, idempotent retry separate path; IP soft cap cao cho shared Wi-Fi |
| Scoped-read | R05/R06 | Browser+resource 60/phút, đủ polling 3 giây; backoff network/realtime down |
| Owner-read/write | R07–R20 | Owner+store, read 120/phút, write 30/phút; burst claim có bounded queue, không bypass FIFO |
| Pickup verify | R10 | Thêm per-order failed attempts, 5 sai/5 phút rồi cooldown/hỗ trợ; owner auth không miễn chống brute force |
| W | R21 | Provider/merchant ingress riêng, signature/size prefilter, dedupe rẻ, queue/retry; không chung bucket guest/shared Wi-Fi, chỉ trust IP allowlist nếu vendor công bố và cập nhật |

## 9. Test matrix — kế hoạch cần chạy ở phase implementation

**Chưa viết/chạy runtime tests.** Expected là acceptance criterion; “500” dùng INTERNAL_ERROR sanitized. Request id/UUID khác nhau phải có chủ ý trong harness. Bao gồm cả HTTP, state và bất biến DB/log.

| ID | Hành vi / setup | Expected HTTP / state | Invariant phải assert |
|---|---|---|---|
| S01 | QR table public, chưa verify | 200 requiresSessionCode=true, session=null | Không lộ code/session/order, QR không cấp quyền |
| S02 | Mã phiên sai rồi hết hạn | 422 INVALID_SESSION_CODE; 410 SESSION_EXPIRED cho expired | Không grant/ticket; log không mã nhập |
| S03 | Cookie phiên bàn A đọc/đặt bàn B | GET 404 ORDER_NOT_FOUND; create 403 SESSION_REQUIRED | Cross-table/cross-store deny, không row mới |
| S04 | Đóng bàn rồi dùng QR+mã/token cũ | 410 SESSION_EXPIRED khi verify/submit | Close+revoke atomic, không tái mở session cũ |
| S05 | Không cookie đoán `/order/:id`/API, biết ticket/key | 401; cookie khác 404 hoặc replay create 403 | ID/key không auth, không trả DTO/Set-Cookie grant của người khác |
| S06 | 20 retry R04 cùng browser/key/payload kể cả mất first response | Mỗi replay 201 cùng ID/ticket/intent snapshot | Một order, một counter increment, bootstrap cookie khôi phục grant |
| S07 | Key cũ nhưng đổi quantity/revision/note | 409 DUPLICATE_REQUEST_CONFLICT | Không order/ticket thứ hai, không sửa snapshot |
| S08 | 100 dine-in và verified takeaway accept đồng thời | 201 orders và 200 webhook ACK; ticket unique theo DB serialize | Một counter/store/day, không MAX/client time, rollback không gap do failed tx |
| S09 | Takeaway create chưa trả tiền | 201 pending_payment/ticket=null; R06 200 pending | Không queue/claim, serviceDate/acceptedAt=null |
| S10 | Cùng signed webhook event gửi 10 lần | 200 accepted lần đầu/duplicate các lần sau | Một ledger tx, một ticket, một credential, outbox không lặp domain mutation |
| S11 | Event ID khác nhưng providerTransactionId giống | 200 duplicate sau verify | Dedup cả tx ID, không counter lần hai |
| S12 | Forged signature hoặc merchant account khác | 401 UNAUTHORIZED | Không paid/ticket; không tin return URL/screenshot |
| S13 | Signed success sai amount/currency/reference | 200 recorded_exception sau evidence; known order exception/null ticket | Unknown ref không gán đại; không paid/queue, không expose raw evidence |
| S14 | Tiền về sau expiry, trước đó worker cancelled | 200 ACK evidence, order payment_exception | Không auto queue/backdate, giữ ticket null |
| S15 | Expiry và success webhook cạnh tranh | Webhook thắng→paid/accepted; expiry thắng→exception khi tiền về | Cùng locks, một outcome nhất quán, không paid thiếu ticket |
| S16 | Failure event đến sau succeeded / transaction tiền mới cùng ref | 200 ignored/evidence; order vẫn paid ticket cũ | Không lùi trạng thái, không phát số mới, giữ anomaly |
| S17 | Owner hai tab claim cùng requestId | 200 cùng order/detail hoặc cùng null | Một lần chuyển preparing, không skip đầu hàng |
| S18 | Hai tab claim hai requestId khác | 200 hai đơn accepted nhỏ nhất tuần tự | Không trùng order; orderId/filter gửi vào command bị 400 |
| S19 | Accepted đầu hàng đang locked | Claim chờ hoặc 500 timeout/retry, không claim số sau | Không SKIP LOCKED, bắt đầu FIFO; hoàn tất có thể khác thứ tự |
| S20 | Qua nửa đêm có old-day tx đang accept + new-day submit/claim | Serialize admission gate, claim ngày cũ trước | Không ticket ngày mới vượt old-day acceptance chưa commit; không renumber |
| S21 | R09 ready từ accepted hoặc stale expectedVersion | 409 INVALID_STATE_TRANSITION | Không nhảy bước/version, UI refetch không giả success |
| S22 | Complete takeaway thiếu/sai code hoặc chưa paid | 400 thiếu schema/422 sai code;409 guard | Không consume/complete, attempts ghi/redact đúng; rate 429 nếu brute force |
| S23 | Complete takeaway đúng code, retry cùng key sau consumed | 200 cùng completed; key mới→409 | Verify+consume+complete atomic, không pickup code trong response chung |
| S24 | Gọi thêm vs begin_checkout | Submit thắng→201 và bill mới; checkout thắng→409 SESSION_CHECKOUT_PENDING | Không order lọt sau khóa bill, session version tăng |
| S25 | Double confirm settlement cùng/key khác | Same key 200 replay; key khác 409 | Một success/session, close+revoke+payment derived atomic |
| S26 | Cancel checkout khi chưa success / sau closed | 200 open; closed→409 | Không mở lại closed hoặc revoke ngược |
| S27 | Giá/option availability đổi sau R03 | R04 409 PRICE_CHANGED/OUT_OF_STOCK | Revision check dưới lock; không silent charge; client price giả không dùng |
| S28 | Owner store A sửa menu/settings/bàn store B | 404 resource hoặc 403 membership | Tenant isolation API+RLS; storeId payload không cấp quyền |
| S29 | Realtime publisher chết sau DB commit / events đảo thứ tự | Mutation vẫn commit; outbox retry; GET snapshot 200 | Không mất trạng thái, event không nguồn paid, version cũ không đè mới |
| S30 | Offline/reload sau submit timeout, cookie còn | Không HTTP lúc offline; reconnect replay 201 và GET 200 | Không UUID mới, không duplicate order/charge; giữ pending chưa rõ kết quả |
| S31 | Shared Wi-Fi nhiều browser poll, một browser đoán mã | Legit reads 200; attacker 429 scoped | Không chặn cả quán, Retry-After/backoff được tôn trọng |
| S32 | Buyer includePickup / default detail / owner queue / cookie lạ | 200 private code đúng buyer; default/owner không code; lạ 404/403 | Secret projection không public, no-store, không log/hash/ciphertext leak |
| S33 | Private open-session response mất rồi replay, sau close replay | 201 cùng mã còn hạn; 410 sau close | Không plaintext operation result, không mã hồi sinh, grid không mã |
| S34 | Store pause sau create intent còn hạn | New create409; verified intent cũ ACK200 accepted theo Q7 | Pause không tự hủy tiền đang về; không client tự accept |
| S35 | DB lỗi giữa ledger success và counter update | 500 webhook retry; rollback mọi domain write | Không paid/no ticket hoặc ticket/no paid; dedupe không đánh processed sớm |

Test implementation cần DB sạch có constraints, transaction contention harness, provider sandbox/signature fixtures đúng vendor, log redaction assertion và browser auth/cookie tests. Kiểm tĩnh examples/types ở P0-C02 chỉ chứng minh artifact nhất quán, không thay các ca trên.

## P2-HF01 credential policy (2026-10-24, overrides earlier session-code assumptions)

Table PIN is exactly six ASCII digits, CSPRNG,24h maximum session lifetime; guest credential remains256-bit opaque HttpOnly cookie with scoped grant<=12h. PIN is not a guest token. Legacy long-code sessions are not silently converted; owner rotate explicitly provisions PIN in the same session, existing grants persist. Old long-code verify is disabled on the new server. New grants require open (not checkout_pending). PIN verifier reuses code_hash with HMAC-SHA256(store/session/generation/PIN); ciphertext reuses session_code_deliveries, with12-byte IV/16-byte GCM tag. Service-only constant-work comparison runs under session lock after durable rate limits. Owner reveal audits no value; no public/list payload contains the secret. Existing Q5 pickup assumptions remain unchanged; this hotfix resolves table PIN delivery only.
