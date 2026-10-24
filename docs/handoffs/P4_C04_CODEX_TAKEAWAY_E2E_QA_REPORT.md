# P4-C04 — Takeaway integration & security QA

Ngày kiểm tra: 24/10/2026. Phạm vi: repository hiện tại, PostgreSQL/Supabase Docker local và Next.js production build chạy loopback. Codex chỉ sửa server/API/contracts/tests; giữ nguyên các thay đổi UI đang chạy song song của Gemini.

**Quyết định: NO-GO cho nghiệm thu đầy đủ Phase 4 / READY_FOR_PHASE_5. Provider thật: BLOCKED_PROVIDER_E2E.** Người dùng xác nhận chưa có staging HTTPS/webhook sandbox có kiểm chứng và chọn nghiệm thu local. Không tạo payment thật, không gọi payOS network bằng credential thật, không chạy migration hay ghi dữ liệu Production. Các webhook trong tests là TEST ONLY fixtures ký bằng key thử nghiệm, không phải giao dịch ngân hàng.

## 1. Inventory kiểm tra từ source và local DB

| Mắt xích | Trạng thái | Chứng cứ / giới hạn |
|---|---|---|
| Counter QR → public menu, table QR + PIN riêng | EXISTS | Route QR/menu, migration006/009; integration và HTTP dine-in/PIN regression |
| Cart/checkout Takeaway | EXISTS | `POST /api/public/orders`, server validation/snapshot; pending không có ticket; UI của Gemini tồn tại nhưng chưa nghiệm thu trình duyệt tại đây |
| payOS adapter | EXISTS | `@payos/node` 2.0.5, create/get/signature parsing thực; SDK calls dùng test doubles trong tests |
| Cấu hình provider cho deployment HTTPS | NOT_CONFIGURED | Có tên biến PAYOS/keys trong env; không kết luận giá trị hợp lệ. Return origin hiện là loopback HTTP, production config phải từ chối; chưa có staging callback được xác minh |
| Durable intent / webhook inbox / ledger | EXISTS | Migration010; tên ledger thực là `payments`, không phải `payment_transactions` |
| Paid → FIFO chung atomic/idempotent | EXISTS | `p4_process`, shared `ticket_counters`, audit/outbox cùng transaction; 100 mixed acceptance local |
| Queue và serializer khi paid bị review | BROKEN → FIXED LOCAL | Migration012 bổ sung eligibility hold, queue/counts/exceptions và review fields; không sửa/xóa ticket lịch sử |
| Provider observe trước/sau verified webhook | BROKEN → FIXED LOCAL | Trước đây flag không được clear hoặc bị đặt lại sau paid; migration012 chỉ observe pending, verified success clear provisional flag |
| Owner claim / ready / pickup complete | EXISTS | Existing owner routes; strict FIFO, version/request replay; pickup hoàn tất ở RPC riêng |
| Private six-digit pickup | EXISTS | Migration011; HMAC + AES-GCM, order/browser proof, issue create-if-absent, recovery worker, consume atomic |
| Reconciliation endpoint | EXISTS | `POST /api/internal/payments/reconcile`, server-only Bearer secret; query status không tự mark paid |
| Scheduler triển khai | NOT_CONFIGURED | Không có scheduler/worker deployment tự cài trong repo; GET không expire/provision/issue thay worker |
| Transactional outbox | EXISTS | Ghi cùng transaction, payload chỉ IDs/version/type; rollback tests |
| P4-C02 / realtime publisher | INCOMPLETE | Không tìm thấy implementation/handoff P4-C02 hoặc publisher private channel. Không tuyên bố outbox = đã notify |
| Polling fallback / refetch | EXISTS | Customer/owner GET DB-only, no-store, UI có polling/visibility/online/refetch. Browser offline/reconnect acceptance: NOT_RUN |
| Correlation tracing | INCOMPLETE → FIXED LOCAL | Các route order/payment/queue/pickup/reconcile dùng UUID server-generated, `X-Request-Id`, thời lượng/status; log không nhận arbitrary payload |
| Real provider sandbox E2E | NOT_CONFIGURED | **BLOCKED_PROVIDER_E2E** theo xác nhận người dùng |

Nguồn đã đối chiếu: README/PRD/ARCHITECTURE/UI/PLAN/TASKS, contracts, P3-C01/C02/C03 handoffs thực tại `docs/integration`, P4-C01/C03 và Gemini G01/G03 tại `docs/handoffs`. Các tên prompt dài trong yêu cầu cũ không được xem là implementation có sẵn. Bảng TASKS gốc chưa phản ánh toàn bộ code hiện tại; không dùng checkbox tài liệu làm bằng chứng runtime.

## 2. Những thay đổi thuộc C04

| File / nhóm file | Thay đổi |
|---|---|
| `supabase/migrations/20261024001200_payment_review_queue.sql` | Atomic forward migration, preflight body hashes của 5 RPC/projection, normalize CRLF/LF; full function replacements, không SQL marker surgery. Thêm helper hold server-only; sửa queue/exceptions/counts/ready, review event/version, payment view, observe race và single-statement authorized reads |
| `docs/contracts/types.ts`, `API_CONTRACT_V1.md`, `STATE_MACHINES.md`, `src/lib/validations/orders.ts` | `paymentReviewRequired?: boolean` trên takeaway summary; paid có thể `reconciliationRequired:true` trong khi vẫn giữ chứng cứ paid; mô tả exceptions/eligibility mới |
| `src/lib/validations/owner-orders.ts` | Exceptions filter nhận cả accepted/preparing/ready/completed khi held; DB vẫn chỉ trả các hàng thực sự thuộc view |
| `src/server/orders/owner-database.ts` | Map `PAYMENT_REVIEW_REQUIRED` thành 409 sanitized thay vì 500 |
| `src/server/security/trace.ts`, `api.ts`, payment/pickup service | Async-local correlation ID; error/recovery log allowlist, không log SDK error/body/code |
| API routes public orders/detail/payment, webhook/reconcile, owner list/claim/ready/complete | Bọc request trace, không đổi request body hay envelope |
| `tests/integration/payments/payments.test.ts` | Regression review/observe, inactive QR/checkout/options/amount validation, faults trước ledger/trước và sau outbox, 12 wrong attempts, mixed 100 acceptance và evidence metrics |
| `tests/integration/payments/review-migration.test.ts` | Fresh chain001–012, rollback/catalog+ACL, 5 drift guards, CRLF, bảo toàn bàn/QR/phiên, validated constraints, quyền service-role và lock order |
| `tests/integration/payments/http-smoke.mjs` | Trace DB-backed, UUID headers/log privacy, held order exception/409/claim exclusion qua HTTP |
| `tests/unit/request-trace.test.ts`, `pickup.test.ts`, `qr-security.test.ts`, `orders/owner-orders.test.ts` | 20 simultaneous correlation contexts, sanitized logs, table PIN/pickup cryptographic domain separation và exceptions filter contract |
| `docs/handoffs/evidence/P4_C04_LOCAL_*.json` | Output đã che ID/không chứa credentials, PIN, pickup code, raw provider body |

Các thay đổi P4-C01/C03 và UI/Gemini đã có sẵn trong worktree được giữ nguyên; không nhận toàn bộ `git diff` là công việc C04. Không thêm dependency cho C04. Không sửa JSX/CSS/dashboard/customer presentation.

Compatibility: thêm field optional cho summary, giữ `status`, `paymentStatus`, `ticketNo` lịch sử. `paid` không có nghĩa là được phép chế biến nếu `paymentReviewRequired=true`. Không thêm API bypass/mark-paid/clear-review. Exceptions view mở rộng nghĩa để giữ được cảnh báo của đơn đã có ticket, kể cả anomaly xuất hiện sau completed.

## 3. Nguyên nhân gốc và tính đúng đắn của migration012

Migration010 dùng `needs_reconciliation=true` khi có tiền bổ sung/mismatch sau paid, nhưng payment view chỉ nhìn `status='exception'`; paid là terminal nên flag bị ẩn. Queue/list/counts/claim/ready cũng bỏ qua flag, trong khi pickup011 đã chặn flag. Kết quả là một đơn không thể giao vẫn có thể được nhận làm. Hai regression mới đã FAIL trên baseline local trước bản sửa, rồi PASS sau sửa.

Một provisional `observe(PAID|UNDERPAID)` trước webhook có thể để lại flag làm pickup không bao giờ được cấp. Một query đang chạy có thể kết thúc sau webhook và đặt lại flag cho paid. Regression thứ hai tái hiện cả hai thứ tự. Verified success hiện clear flag provisional; observe chỉ cập nhật pending và không thể tự cấp ticket. Anomaly tài chính đã được webhook ghi nhận vẫn đi review; không tự giải phóng tiền mismatch/late.

Migration012 không viết lại bất kỳ hàng hiện có nào. Order held giữ nguyên status/ticket/acceptedAt để bảo toàn lịch sử, bị loại khỏi work queue, hiện trong exceptions; ready trả409. Lần đầu paid chuyển sang hold tăng version và emit `payment.review_required` không chứa bí mật. Replay evidence không tạo thêm event. Pickup complete tiếp tục dùng gate011.

Giữ lock order: receipt → store `FOR NO KEY UPDATE` → intent → order → transaction advisory; owner command advisory → rate → store → session SHARE → order; pickup store → intent → order → credential. Không provider IO trong transaction. Claim lấy head **đủ điều kiện** sớm nhất `(service_date,ticket_no,id)` và chờ lock, không `SKIP LOCKED`. Không âm thầm bỏ qua head corrupt/unpaid; lỗi invariant vẫn fail closed.

Reads order/payment trước đây có thể lấy các biến row ở những statement khác nhau. Read branch mới join authorization + order + intent + projection trong một MVCC statement. Private pickup tracking011 vốn đã dùng cách này.

Deployment: apply 010 → 011 → 012 theo đúng baseline đã review. Preflight012 phải fail nếu bất kỳ trong 5 body khác digest mong đợi; đọc/audit deployed definition rồi lập forward fix, không bỏ guard. Toàn bộ migration trong `begin/commit`; abort/rollback trước commit khôi phục definitions/ACL. Sau commit rollback bằng reviewed forward migration khôi phục logic đã chọn, không drop financial/pickup history. Chưa apply Production; chưa kết luận catalog Production khớp local.

## 4. DB-backed trace đã che thông tin

Nguồn: [`evidence/P4_C04_LOCAL_HTTP_TRACE.json`](evidence/P4_C04_LOCAL_HTTP_TRACE.json), tạo bởi `node tests/integration/payments/http-smoke.mjs`. Alias `local-takeaway-A` / `local-intent-A` thay UUID; không chứa mã nhận món hoặc cookie.

| Bước HTTP / DB | status | payment | ticket | version |
|---|---|---|---|---|
| Pending checkout lưu bằng RPC thật trong test | pending_payment | pending | null | 1 |
| 20 signed fixture webhook HTTP → verified admission | accepted | paid | 1 | 2 |
| Owner claim-next | preparing | paid | 1 | 3 |
| Owner ready | ready | paid | 1 | 4 |
| Owner private pickup verification; 20 cùng-key retry | completed | paid | 1 | 5 |

DB đối chiếu: ledger1, acceptance event1, completion audit1, completion outbox1; `verified_at=completed_at`, verified actor đúng owner. Guest final GET trả `pickup:null`. Receipt/ticket/consume không suy ra từ success redirect hoặc frontend state.

HTTP script seed pending qua `p4_checkout` để không chạy provider IO trong `after()` của POST. Checkout service/validation được kiểm bằng DB integration; provider instruction creation có SDK test doubles ký response. **Đây là local backend integration trace, không phải counter → ngân hàng → webhook E2E thật hay browser E2E.**

## 5. Ma trận A–D

Ký hiệu chứng cứ: **P** = `tests/integration/payments/payments.test.ts`; **M** = payment migration tests010/011/012; **O/Q** = integration orders/owner-queue; **H** = payments HTTP script; **D** = orders HTTP script; **U** = unit payos/pickup/request-trace; **UI** = tests/ui (không phải chạy browser).

| ID | Ca nghiệm thu | Trạng thái / chứng cứ |
|---|---|---|
| A01 | Counter QR/menu; QR bàn không thành takeaway; inactive QR | PASS local P inactive/type; D counter menu/PIN; integration QR/menu |
| A02 | Backend quantity/option/availability/revision/price snapshot, từ chối total giả | PASS P C04 checkout + existing P/O; option fixture3×(35000+7000)=126000 integer |
| A03 | Same clientRequestId replay/conflicting payload | PASS P20 concurrent create; H lost/repeated complete; immutable checkout result/revision guard |
| A04 | Bad HMAC, account/merchant/link/reference/amount/currency/non-success | PASS U canonical signature/tamper; P mismatch/late/merchant; H401 signature before inbox, no ticket/queue |
| A05 | 20 duplicate webhooks + callbacks đồng thời, một ledger/ticket/acceptance/credential | PASS P/H20; durable event/transaction dedupe; one acceptance work item in `orders` (không có queue table riêng) |
| A06 | Expiry/late/unknown/out-of-order → review; paid không downgrade | PASS P pending expiry, pre-deadline receipt recovery, signed failure after paid, extra transaction hold C04; no unpaid admission |
| A07 | Fault trước ledger, sau counter/before order, trước/sau outbox; safe retry | PASS local P fault tests + O/Q late failure. Không có half-commit; worker/response retry dùng nguyên key/evidence |
| A08 | Paid nhưng chưa có pickup; recover idempotent, GET không cấp/rotate | PASS P key outage + recover +20 ensure/recover; stable credential; H private GET |
| B01 | Mixed acceptance cùng counter, theo DB acceptance | PASS P mixed2 và mixed100; pause quán không hủy intent đã funded hợp lệ |
| B02 | >=100 concurrent acceptance | PASS local P100 (50 dine-in/50 takeaway), metrics bên dưới; không diễn giải thành production capacity |
| B03 | Strict eligible FIFO, head lock wait, không SKIP LOCKED | PASS Q locked-head/change-head/concurrent claims; P held exclusion; M lock order/SQL guard |
| B04 | Two-tab version/idempotency owner | PASS Q stale-version one success/one409,20 same-key claim, distinct claim keys; H claim/complete retry |
| B05 | Unpaid/exception không thành phiếu bếp | PASS P pending queue empty/ticketnull; held paid loại queue/counts, exceptions visible; H409 review, claimnull |
| C01 | Ready+paid+valid code complete một lần, actor/timestamps/audit | PASS P20 same/distinct key; H DB trace, consumed proof guard |
| C02 | Sai/thiếu code, cross-owner/store, hết quyền, code hết hạn | PASS P/U/H422/400/403/404/409; buyer scope và membership rechecked |
| C03 | PIN bàn không phải pickup credential | PASS domain-bound pickup HMAC U; D PIN regression. Numeric table PIN không được dùng làm proof hay grant pickup. Chưa chạy browser nhập PIN bàn thực vào pickup dialog; không bảo đảm hai số ngẫu nhiên không bao giờ trùng giá trị |
| C04 | Accepted/preparing/unverified/review/completed không giao trái phép | PASS P guards matrix; H pending409; C04 review gate; repeated complete mới409 |
| C05 | Leading zeros là string, không regenerate reload | PASS P forced TEST ONLY `000042` + repeated private read; U CSPRNG/encryption/context binding |
| C06 | 10+ wrong attempts, lock/backoff, retry sau cooldown | PASS P12 new-key wrong submissions:5 invalid,7 rate-limited; failed replay không đếm lại; simulated local clock expiry then correct success; owner10/min across3 orders |
| C07 | Concurrent completion/lost response/body conflict | PASS P20 same-key +20 distinct-key; H20 replay, one audit/outbox, changed payload409 |
| D01 | Auth/RLS/CSRF/guest isolation, server-only secrets | PASS M/O/Q/P/H/D + auth46; anon/authenticated không EXECUTE/select payment/pickup; foreign guest UUID404; origin403 |
| D02 | Outbox after commit và no secrets | PASS DB atomic write/rollback và restricted payload checks; **BLOCKED realtime delivery** vì publisher chưa có |
| D03 | Poll/reload/reconnect source of truth, không duplicate action | PASS H/D GET after transitions và command replay; UI tests/source polling guard. **NOT_RUN browser offline/reconnect** |
| D04 | Dine-in QR+six-digit PIN/menu/cart/order/FIFO/ready/complete/session regression | PASS O/Q/D và PIN integration; completed vẫn unpaid/session open, không tự settle bàn |
| D05 | Correlation IDs, no sensitive log | PASS U20 async contexts + H unique server X-Request-Id and log allowlist/privacy. No URLs/body, inbound ID bị bỏ qua |

### Commands và kết quả

Kết quả dưới đây là các lệnh đã hoàn tất. Lượt DB integration cuối chạy tuần tự với HTTP; không dùng lượt chạy bị nhiễu làm PASS. Run DB integration, payment HTTP, then dine-in HTTP serially: reconciliation may retry another test's failed receipt, and HTTP scripts both write .next.

| Command | Kết quả |
|---|---|
| `npm run lint` | PASS 0 errors/warnings |
| `npm run typecheck` | PASS |
| `npm run build` | PASS Next16 production build; build không chứng minh provider config hợp lệ |
| `node node_modules/vitest/vitest.mjs run --config tests/unit/vitest.config.mts` | PASS119,16 files |
| `npm run test:auth` | PASS46 |
| `npm run test:db` | PASS9 |
| `node node_modules/vitest/vitest.mjs run --config tests/ui/vitest.config.mts` | PASS203,13 files (source cuối Gemini G04); source/model tests, browser NOT_RUN |
| `node node_modules/vitest/vitest.mjs run --config tests/integration/vitest.config.mts --disableConsoleIntercept` | PASS125,16 files;231.43s, gồm migration012 và payment/pickup26 |
| `python docs/contracts/validate_contracts.py` | PASS45 typed examples,6 negative type checks,21 route sections; static checks only |
| `node tests/integration/payments/http-smoke.mjs` | PASS Next+Postgres fixture webhook, privacy, review gate, one completion; artifact |
| `node tests/integration/orders/http-smoke.mjs` | PASS actual PIN/cookie/API/queue/dine-in regression |
| `git diff --check` | PASS |
| Real payOS sandbox / browser staging / Production migration | BLOCKED_PROVIDER_E2E / NOT_RUN / NOT_RUN |

Verification history: baseline regression FAIL trước fix là chủ đích. Lượt integration tổng đầu:124/125 pass; fault-injection failed vì HTTP reconcile chạy đồng thời retry receipt sau khi tháo test trigger. Một lượt riêng sau đó25/26 pass vì recovery fixture dùng paymentLinkId cố định đụng unique constraint với fixture của runner đã ngắt. Sửa test dùng random link ID; dọn đúng fixture UUID/name/createdAt đã xác minh. Lượt tổng cuối125/125 PASS. Không dùng lượt fail làm bằng chứng pass. Không còn payment test store/test-failure trigger và không có unvalidated constraint sau cleanup local. Test-only triggers/fixtures nằm local, không sửa runtime thành mock/paid bypass.

### Stress local

[`evidence/P4_C04_LOCAL_STRESS.json`](evidence/P4_C04_LOCAL_STRESS.json) được test ghi sau burst và verify DB. Lượt tổng cuối: **100/100 success,0 errors,0 application retries,0 failed inbox; burst939ms,p50=606ms,p95=917ms**. Concurrency100,50 signed fixture paid callbacks +50 real dine-in service acceptances, shared store/date admission gate; assertion contiguous tickets theo `accepted_at`,100 acceptance audit/outbox,50 ledgers. Đo service end-to-end; takeaway gồm signature/receipt/process/pickup issue. Setup fixtures không tính vào burst. Không dùng k6, không claim100 browser users hoặc Production SLA.

Không có application auto-retry trong burst. `failedInbox=0` và zero rejected operations là bằng chứng không có deadlock/lock-timeout surfaced; không đo toàn bộ PostgreSQL server-wide deadlock counter hay provider latency.

## 6. Security findings và tồn đọng

| ID / severity | Kết quả |
|---|---|
| F01 HIGH — paid-review vào bếp, API giấu hold | FIXED LOCAL012, test FAIL→PASS; Production NOT_DEPLOYED |
| F02 HIGH — provisional provider observation giữ/đặt lại hold cho verified paid | FIXED LOCAL012, kiểm cả observe→webhook và webhook→observe; không dùng status query để xác nhận paid |
| F03 MEDIUM — mixed-statement read snapshot | FIXED LOCAL012; authorization và projection cùng statement |
| F04 MEDIUM — correlation thiếu ở payment/order failure logs | FIXED LOCAL, UUID server-generated + allowlist; chưa có telemetry backend/alert deployment |
| F05 RELEASE BLOCKER — provider real E2E chưa có | OPEN: staging HTTPS, registered callback, hợp lệ provider test channel, verified event và trace đối chiếu ngân hàng/provider |
| F06 OPERATIONAL — scheduler/realtime publisher chưa triển khai | OPEN: bảo đảm reconcile có lịch; polling là fallback hiện có, không thể tuyên bố realtime delivery |
| F07 OPERATIONAL — reconciliation/manual money resolution | OPEN: không có API tự clear hold/refund/auto-accept late. Cần runbook có người đối soát; giữ immutable evidence/ticket, không sửa tay để bypass |
| F08 MEDIUM / INTEGRATION | OPEN: OrderTrackingView and owner order components do not yet consume paymentReviewRequired in the audited source. Backend blocks held work; Gemini must display the hold for paid/preparing/ready as well as payment_exception, suppress delivery CTAs, and run browser/mobile/offline/multi-tab acceptance. |

Pickup hash/ciphertext/key IDs chỉ server; plaintext chỉ private buyer projection. HMAC/encryption keys tách riêng và context-bound. Credential TTL24h, buyer access12h, cookie browser30d; credential có thể còn hạn khi quyền đọc guest đã hết, không mở lại quyền qua UUID. Không lưu mã trong URL/log/outbox/owner list. Raw signed evidence có thể chứa bank data, chỉ nằm protected inbox; retention/monitoring là việc vận hành chưa nghiệm thu.

## 7. Handoff cho Gemini — API thực và hành vi

| Method / URL | Quyền / input | Output / lưu ý |
|---|---|---|
| `GET /api/public/qr/:code` | Public locator; bootstrap existing guest cookie mechanism | QR context phân biệt table/takeaway, không cấp quyền đọc order khác |
| `GET /api/public/menu?qrCode=...` | Public active QR | Menu/revision; backend tính giá khi submit |
| `POST /api/public/table-sessions/verify` | Same-origin guest; `{qrCode,sessionCode}` six-digit PIN | Chỉ cho QR bàn; không phải pickup |
| `POST /api/public/orders` | Existing guest cookie + same-origin; `CreateOrderV1Input` | 201 immutable pending command snapshot, takeaway ticketNo=null; instructions có thể null trong khi provision async |
| `GET /api/public/payments/:id` | Buyer cookie + server-derived proof, no query | Takeaway payment projection; no-store; no provider IO/expiry mutation |
| `GET /api/public/orders/:id` | Guest scope, optional `includePickup=true` | Default order detail không có pickup. Private mode `{order,pickup:{code,expiresAt}|null}` chỉ buyer; không code khi hold/completed/expired/unauthorized |
| `POST /api/webhooks/payments/payos` | Signed provider data; không cookie/CSRF | Provider ACK `{code:'00',desc:'success'}` chỉ khi receipt lưu được; ACK không đồng nghĩa accepted/paid |
| `POST /api/internal/payments/reconcile` | Server-only Bearer secret; không client UI | Maintenance retry/expiry/provision/recovery; cần schedule ngoài ứng dụng |
| `GET /api/owner/orders` | Owner cookie/membership, store từ server | Query `view=queue|exceptions|history`, type/status/orderId/cursor/limit<=100; page + counts/detail; queue không trả held work |
| `POST /api/owner/queue/claim-next` | Owner + same-origin, `{requestId}` | Oldest eligible order hoặc null. Không nhận orderId/ticket để nhảy FIFO |
| `POST /api/owner/orders/:id/ready` | Owner + same-origin, `{requestId,expectedVersion}` | Detail/version mới;409 nếu hold hoặc stale/wrong status |
| `POST /api/owner/orders/:id/complete` | Owner + same-origin | Dine-in `{requestId,expectedVersion,type:'dine_in'}`; takeaway thêm `type:'takeaway',pickupCode:'000042'` string. Verified consume+complete atomic |

Error thực:400 schema/extra field;422 order business validation hoặc `INVALID_PICKUP_CODE`;401 thiếu auth/bad webhook HMAC;403 membership/origin;404 resource/cross-scope;409 stale/version/type/duplicate conflict/`PAYMENT_REVIEW_REQUIRED`/`PICKUP_NOT_ALLOWED`/`ORDER_ALREADY_COMPLETED`;429 có Retry-After/details;500 sanitized internal;503 provider/key unavailable;410 expired table grant. Route-specific `OrderFault` validation422 khác generic strict reader400; không gộp mọi validation vào một status.

Gemini cần consume `paymentReviewRequired` trên list/detail và `payment.reconciliationRequired` trên detail/payment, kể cả paymentStatus vẫn paid. Giữ cảnh báo đối soát, ẩn nút ready/complete và pickup card khi hold; exceptions nhận các lifecycle status có ticket, không hiển thị chúng như work đang chờ bếp. Count paymentException gồm held. Event mới `payment.review_required` là invalidation-only nếu publisher được triển khai sau.

Giữ `pickupCode` dạng string từ input tới request; table session PIN không phải authorization cho pickup. Chỉ fetch private buyer projection ở tracking đã có đúng cookie, không lưu mã vào localStorage/URL/analytics. Completed nghĩa là đã giao, `fulfillmentStatus='collected'`; không lấy paid làm completed. Timestamp/version do server cấp.

Timeout/lost response: retry **cùng requestId/clientRequestId và immutable body/target/version**; không tạo key mới vì poll đổi version. Response replay có thể là snapshot cũ; refetch rồi chỉ áp version mới, không overwrite state mới bằng replay cũ.429 tuân Retry-After; không loop retry nhanh. No realtime publisher: tiếp tục protected polling/refetch, không suy payment từ redirect/screenshot/client state; GET không tự issue pickup. Khi key thiếu sau paid, worker retry phục hồi create-if-absent; UI không ép khách trả lần nữa.

Các file UI thay đổi đồng thời được giữ nguyên. Báo cáo này bàn giao contract; không tự sửa UI để giả hoàn tất Gemini acceptance.

## 8. Go / No-Go và bước tiếp theo

**Local backend QA: PASS**, artifact đã cập nhật, full integration125/125. Chưa đề xuất **READY_FOR_PHASE_5** cho integrated acceptance: cần provider E2E có chứng cứ, migration deployment review đúng project, reconcile scheduling và Gemini browser QA; realtime publisher riêng chưa có (roadmap Phase6) nên không đánh dấu D02 realtime PASS.

Các bước mở khóa: chuẩn bị staging HTTPS/registered payOS webhook trong test channel hợp lệ; apply reviewed migrations với preflight không bỏ guard; chạy checkout→instructions→provider event thật→shared FIFO→pickup trên staging, test duplicate/late/mismatch an toàn; cấu hình reconcile schedule/monitoring; Gemini nghiệm thu review state + mobile/reload/offline/multi-tab. Không gửi secret vào chat hoặc báo cáo.
