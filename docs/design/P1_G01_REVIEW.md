# P1-G01 REVIEW & HANDOFF REPORT

> **Phiên bản:** 1.0 (Phase 1 — Sprints 1) · **Ngày:** 23/10/2026  
> **Tác giả:** Senior Product UI Engineer / Visual Designer (Gemini)  
> **Mục tiêu:** Bàn giao Design System và 2 bộ khung giao diện trình diễn (`CustomerShell` & `OwnerShell`) sang cho Codex tích hợp hạ tầng Next.js.

---

## 1. Cấu trúc Cây Component Đã Xây Dựng (Component Tree)

```
src/
├── styles/
│   └── theme.css                   # Biến CSS tokens: --qr-brand-*, --qr-surface-*, semantic status
├── lib/
│   └── mocks/
│       └── ui-preview.ts           # Dữ liệu giả lập thực tế, chuẩn contracts/types.ts
└── components/
    ├── customer/                   # [Khu vực 1] Khách hàng Mobile-First
    │   ├── CustomerModeBadge.tsx   # Badge vị trí: Bàn XX (#E8F4F0) vs Mang đi (#F1F3F2)
    │   ├── CategoryChips.tsx       # Dải chip danh mục cuộn ngang (Pill navigation)
    │   ├── MenuItemPreviewCard.tsx # Thẻ món ăn (ảnh 1:1, giá VND, nút thêm, hết món)
    │   ├── StickyCartPreview.tsx   # Thanh giỏ hàng nổi cố định đáy (h-14, #1D725E)
    │   └── CustomerShell.tsx       # Khung tổng hợp menu di động cho khách
    └── owner/                      # [Khu vực 2] Chủ quán Dashboard 4 Tabs
        ├── OwnerStatusBadge.tsx    # Huy hiệu trạng thái phân tách màu ngữ nghĩa (Info, Success, Warning, Error)
        ├── OwnerHeaderPills.tsx    # 4 Tab viên thuốc căn giữa header (Đơn hàng, Bàn, Menu, Cài đặt)
        ├── OwnerHeader.tsx         # Header thanh lịch: Logo trái, Nav giữa, Tài khoản phải
        ├── OrderCardPreview.tsx    # Thẻ đơn hàng trong hàng đợi (Ticket FIFO, thời gian, loại đơn)
        ├── OrderDetailPreview.tsx  # Panel chi tiết đơn & nút hành động (Sẵn sàng / Đã giao)
        ├── OwnerEmptyState.tsx     # Khung rỗng tối giản khi hàng đợi trống
        └── OwnerShell.tsx          # Khung Dashboard 70/30 chuẩn ảnh tham chiếu ui-reference.png
```

---

## 2. Danh sách File Đã Tạo trong Workspace

| Đường dẫn File | Loại File | Mục đích | Quyền sở hữu |
|---|---|---|---|
| `src/styles/theme.css` | CSS Variables | Khai báo toàn bộ token màu sắc, góc bo, bóng đổ | Gemini |
| `src/lib/mocks/ui-preview.ts` | TypeScript Mock | Fixture dữ liệu mẫu chân thực, không chứa secret | Gemini |
| `src/components/customer/CustomerModeBadge.tsx` | React Component | Nhận biết ngữ cảnh Bàn 05 vs Mang đi | Gemini |
| `src/components/customer/CategoryChips.tsx` | React Component | Thanh lọc danh mục cuộn ngang bằng ngón cái | Gemini |
| `src/components/customer/MenuItemPreviewCard.tsx` | React Component | Thẻ món ăn có ảnh vuông, giá VND, trạng thái hết hàng | Gemini |
| `src/components/customer/StickyCartPreview.tsx` | React Component | Thanh giỏ hàng cố định đáy màn hình điện thoại | Gemini |
| `src/components/customer/CustomerShell.tsx` | React Component | Khung giao diện toàn diện cho khách hàng | Gemini |
| `src/components/owner/OwnerStatusBadge.tsx` | React Component | Nhãn trạng thái ngữ nghĩa chuẩn WCAG | Gemini |
| `src/components/owner/OwnerHeaderPills.tsx` | React Component | Điều hướng viên thuốc căn giữa chuẩn ảnh mẫu | Gemini |
| `src/components/owner/OwnerHeader.tsx` | React Component | Thanh header chủ quán (Logo, Nav, Account) | Gemini |
| `src/components/owner/OrderCardPreview.tsx` | React Component | Thẻ đơn hàng sắp xếp theo thứ tự Ticket FIFO | Gemini |
| `src/components/owner/OrderDetailPreview.tsx` | React Component | Cột chi tiết đơn và nút xử lý đơn hàng hợp lệ | Gemini |
| `src/components/owner/OwnerEmptyState.tsx` | React Component | Khung trạng thái rỗng khi chưa có đơn | Gemini |
| `src/components/owner/OwnerShell.tsx` | React Component | Khung Dashboard 70/30 (4 tab) nổi trên nền xám | Gemini |
| `docs/design/P1_G01_REVIEW.md` | Markdown Report | Tài liệu báo cáo và hướng dẫn tích hợp | Gemini |

---

## 3. Hướng dẫn Xem trước (Preview Instructions cho Codex & Chủ dự án)

Sau khi Codex khởi tạo xong hạ tầng Next.js (`package.json`, `npm install`), có thể xem trước trực tiếp 2 Shell giao diện bằng cách chèn tạm vào `src/app/page.tsx` (Codex sở hữu):

```tsx
// src/app/page.tsx (Ví dụ tích hợp để Preview)
'use client';

import React, { useState } from 'react';
import { CustomerShell } from '@/components/customer/CustomerShell';
import { OwnerShell } from '@/components/owner/OwnerShell';
import {
  MOCK_STORE,
  MOCK_CATEGORIES,
  MOCK_MENU_ITEMS,
  MOCK_OWNER_ORDERS,
  MOCK_TABLES_LIST,
} from '@/lib/mocks/ui-preview';

export default function PreviewPage() {
  const [view, setView] = useState<'customer' | 'owner'>('owner');

  return (
    <div>
      {/* Thanh gạt chuyển đổi nhanh chế độ xem thử nghiệm */}
      <div className="fixed top-2 right-2 z-50 flex gap-2 bg-black/80 p-1.5 rounded-full text-xs text-white">
        <button
          onClick={() => setView('owner')}
          className={`px-3 py-1 rounded-full ${view === 'owner' ? 'bg-[#35977D] font-bold' : ''}`}
        >
          Owner Shell (Desktop)
        </button>
        <button
          onClick={() => setView('customer')}
          className={`px-3 py-1 rounded-full ${view === 'customer' ? 'bg-[#35977D] font-bold' : ''}`}
        >
          Customer Shell (Mobile)
        </button>
      </div>

      {view === 'owner' ? (
        <OwnerShell
          storeName={MOCK_STORE.name}
          orders={MOCK_OWNER_ORDERS}
          tables={MOCK_TABLES_LIST}
          menuItems={MOCK_MENU_ITEMS}
        />
      ) : (
        <CustomerShell
          store={MOCK_STORE}
          mode="dine_in"
          tableLabel="Bàn 05"
          categories={MOCK_CATEGORIES}
          items={MOCK_MENU_ITEMS}
          cartItemCount={2}
          cartTotalVnd={67000}
        />
      )}
    </div>
  );
}
```

---

## 4. Yêu cầu Cài đặt Dependencies gửi Codex

Để các component trên biên dịch và render mượt mà, Codex cần bổ sung các package sau trong quá trình bootstrap (T-006):

1. **`lucide-react`:** Thư viện icon đường nét mảnh chuẩn (`npm install lucide-react`).
2. **Font `Be Vietnam Pro`:** Khai báo trong `src/app/layout.tsx` qua `next/font/google`:
   ```tsx
   import { Be_Vietnam_Pro } from 'next/font/google';
   const beVietnamPro = Be_Vietnam_Pro({
     subsets: ['vietnamese', 'latin'],
     weight: ['400', '500', '600', '700'],
     variable: '--font-sans',
   });
   ```
3. **Import `src/styles/theme.css`:** Thêm dòng `@import '../styles/theme.css';` vào đầu `src/app/globals.css`.
4. **Cấu hình Path Alias `@/*`:** Đảm bảo `tsconfig.json` có ánh xạ `"@/*": ["./src/*"]`.

---

## 5. Đối chiếu Nghiệp vụ & Giới hạn An toàn

- [x] **Tuân thủ triệt để ảnh mẫu `ui-reference.png`:** Nền xám `#F5F6F5`, panel trắng bo tròn 28px, thanh pill nav căn giữa, bố cục 70/30.
- [x] **Kiểm soát FIFO trong UI:** Trong `OwnerShell`, nút duy nhất để bắt đầu làm món là `[ ▶ Nhận đơn tiếp theo ]`. Không có nút bắt đầu đơn lẻ gây nhảy cóc hàng đợi.
- [x] **Takeaway Unpaid vs Paid:** Trong `ui-preview.ts`, đơn chưa paid không bao giờ được cấp ticket; đơn đã paid mới có `ticketNo` và vào hàng đợi chế biến.
- [x] **Không lấn sân Backend:** Không có bất kỳ lệnh gọi API fetch, Supabase client, SQL hay logic thanh toán nào bên trong các component UI này.
- [x] **File Ownership:** Không sửa bất kỳ file nào do Codex sở hữu (`package.json`, `layout.tsx`, `page.tsx`, `contracts/**`).

---

## 6. Trạng thái Kiểm tra & Đối soát Thực tế (Verification Status)

- [x] **ESLint (`npm run lint` — `--max-warnings=0`):** **PASS (0 errors, 0 warnings).** Đã sửa toàn bộ 9 vấn đề ESLint do Codex báo cáo tại `P1_C01_HANDOFF.md` (escaped entity trong `OrderDetailPreview.tsx`, `next/image` trong `MenuItemPreviewCard.tsx`, `aria-pressed` trong `OrderCardPreview.tsx`, xóa các unused imports trong `OwnerHeader.tsx`, `OwnerShell.tsx`, `ui-preview.ts`).
- [x] **TypeScript Typecheck (`npm run typecheck`):** **PASS (0 errors).** Không có bất kỳ lỗi typecheck nào trên toàn bộ workspace.
- [x] **Production Build (`npm run build`):** **PASS.** Next.js Turbopack biên dịch thành công 100% trong 6.2s, tạo static pages tối ưu.
- [x] **Đối soát Invariant Fixture:** Đã sửa tổng tiền `order-028` thành `122.000 đ` khớp tổng 2 dòng món (84k + 38k); đã điền đầy đủ 3 dòng món cho `order-027` với tổng số lượng 4 món và tổng tiền `152.000 đ` (70k + 32k + 50k).
- [x] **Đối soát Gate P0:** Đã cập nhật `P0_G02_REVIEW.md` khớp hoàn toàn với 21 endpoints trong `API_CONTRACT_V1.md` và `UI_DATA_HANDOFF.md`. Ready để đóng Task T-005.
