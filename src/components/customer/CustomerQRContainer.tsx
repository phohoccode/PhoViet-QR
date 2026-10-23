'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, ChevronRight } from 'lucide-react';
import type { QRResolution, MenuCategory, MenuItem, OrderDetail } from '../../../docs/contracts/types';
import { ORDER_STATUS_LABELS } from '../../../docs/contracts/types';
import { CustomerOrderModeHeader } from './CustomerOrderModeHeader';
import { TableVerificationCard } from './TableVerificationCard';
import { QRResolutionStateView, type QRResolutionUiState } from './QRResolutionStateView';
import { MenuPreviewSection } from './MenuPreviewSection';
import { StickyCartPreview } from './StickyCartPreview';
import { CustomerSkeleton } from './CustomerSkeleton';
import { ItemDetailSheet, type SelectedItemPayload } from './ItemDetailSheet';
import { usePresentationCart, CartSheet, type ActiveOrderSummary } from './cart';
import { createCartStore } from '../../features/cart';
import { menuRequest, MenuApiError } from '../../features/customer/api-client';
import {
  MOCK_STORE,
  MOCK_CATEGORIES,
  MOCK_MENU_ITEMS,
  MOCK_QR_TABLE_UNVERIFIED,
  MOCK_QR_TABLE_VERIFIED,
  MOCK_QR_TAKEAWAY,
  DEMO_VALID_SESSION_CODES,
} from '../../lib/mocks/ui-preview';

interface CustomerQRContainerProps {
  qrCode: string;
  initialResolution?: QRResolution | null;
  categories?: MenuCategory[];
  items?: MenuItem[];
  demoState?: string | null;
  className?: string;
}

function computeDemoResolution(
  demoState?: string | null,
  initialResolution?: QRResolution | null
): { res: QRResolution | null; err: QRResolutionUiState | null; retrySec?: number } {
  if (initialResolution) {
    return { res: initialResolution, err: null };
  }
  // demoState bị vô hiệu hóa hoàn toàn trong môi trường production
  if (process.env.NODE_ENV === 'production' || !demoState) {
    return { res: null, err: null };
  }

  switch (demoState) {
    case 'takeaway':
      return { res: MOCK_QR_TAKEAWAY, err: null };
    case 'verified':
      return { res: MOCK_QR_TABLE_VERIFIED, err: null };
    case 'unverified':
      return { res: MOCK_QR_TABLE_UNVERIFIED, err: null };
    case 'invalid_qr':
      return { res: null, err: 'invalid_qr' };
    case 'no_session':
      return { res: null, err: 'no_active_session' };
    case 'locked':
      return { res: null, err: 'session_locked_or_closed' };
    case 'rate_limited':
      return { res: null, err: 'rate_limited', retrySec: 30 };
    case 'offline':
      return { res: null, err: 'offline' };
    default:
      return { res: null, err: null };
  }
}

/**
 * CustomerQRContainer — Container chính cho luồng quét mã QR Khách hàng (/q/[code]).
 * Tự động điều phối 2 chế độ (Tại bàn & Mang đi) và đầy đủ các trạng thái QR:
 * - resolving, table_unverified, verifying, table_verified, takeaway_ready
 * - invalid_qr, inactive_table, no_active_session, session_locked_or_closed, rate_limited, offline
 * Tách biệt hoàn toàn presentation khỏi backend, tương thích 100% với R01 và R02.
 */
export const CustomerQRContainer: React.FC<CustomerQRContainerProps> = ({
  qrCode,
  ...props
}) => {
  return <CustomerQRContainerContent key={qrCode} qrCode={qrCode} {...props} />;
};

const CustomerQRContainerContent: React.FC<CustomerQRContainerProps> = ({
  qrCode,
  initialResolution = null,
  categories = MOCK_CATEGORIES,
  items = MOCK_MENU_ITEMS,
  demoState = null,
  className = '',
}) => {
  const router = useRouter();
  const isDev = process.env.NODE_ENV !== 'production';
  // Mock data is an explicit preview only, never a fallback for real API errors.
  const isDemo = isDev && !!demoState;
  const demoSetup = computeDemoResolution(demoState, initialResolution);
  const [previewResolution, setPreviewResolution] = useState<QRResolution | null>(demoSetup.res);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MenuItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  // Lưu giữ thông tin đơn hàng vừa đặt để khách luôn theo dõi được tiến độ
  const [activeOrder, setActiveOrder] = useState<ActiveOrderSummary | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.sessionStorage.getItem(`pv_order_${qrCode}`);
      if (stored) return JSON.parse(stored) as ActiveOrderSummary;
    } catch {
      // ignore
    }
    return null;
  });

  const handleOrderConfirmed = (order: OrderDetail) => {
    const summary: ActiveOrderSummary = {
      id: order.id,
      ticketNo: order.ticketNo ?? 0,
      status: order.status,
      itemCount: order.itemCount,
      totalVnd: order.totalVnd,
      tableLabel: resolution && resolution.type === 'table' ? resolution.table.label : undefined,
    };
    setActiveOrder(summary);
    try {
      window.sessionStorage.setItem(`pv_order_${qrCode}`, JSON.stringify(summary));
    } catch {
      // ignore
    }
  };

  // The store owns both R01 and R03. Rendering/subscribing never fetches again.
  const [cartSource] = useState(() => {
    let preview = demoSetup.res ?? MOCK_QR_TABLE_UNVERIFIED;
    return {
      store: createCartStore({
        qrCode,
        ...(isDemo ? {
          storage: null,
          loadResolution: async () => preview,
          loadMenu: async () => ({ categories, items, menuRevision: 'demo-preview', serverTime: new Date().toISOString() }),
        } : {}),
      }),
      setPreview: (next: QRResolution) => { preview = next; },
    };
  });
  const cartStore = cartSource.store;
  const { cart, cartState, cartActions, readiness } = usePresentationCart({
    qrCode, store: cartStore,
  });
  const { loadError, refreshing, hydrated, menu } = cart.state;
  const resolution = isDemo ? previewResolution : cart.state.resolution ?? initialResolution;
  const isResolving = !isDemo && cart.state.online && !resolution && (!hydrated || refreshing);
  const resolutionErrorState: QRResolutionUiState | null = isDemo ? demoSetup.err
    : !cart.state.online ? 'offline'
    : loadError?.stage !== 'resolution' ? null
    : loadError.status === 429 ? 'rate_limited'
    : loadError.status === 400 || loadError.status === 404 ? 'invalid_qr'
    : loadError.status === 410 ? 'session_locked_or_closed'
    : 'network_error';
  const retryAfterSec = isDemo ? demoSetup.retrySec : undefined;
  const menuCategories = menu?.categories ?? (isDemo ? categories : []);
  const menuItems = menu?.items ?? (isDemo ? items : []);
  const isMenuLoading = !isDemo && refreshing && !menu;
  const menuErrorMessage = loadError?.stage === 'menu'
    ? loadError.status === 429 ? 'Thao tác quá thường xuyên. Vui lòng chờ trước khi tải lại thực đơn.'
      : 'Không thể tải thực đơn từ máy chủ của quán.'
    : null;

  const handleRetryResolve = () => { void cart.refresh(); };
  const handleRetryMenu = () => { void cart.refresh(); };
  const showDemoResolution = (next: QRResolution) => {
    cartSource.setPreview(next);
    setPreviewResolution(next);
    cart.applyResolution(next);
    cart.reconcileWithMenu({ categories, items, menuRevision: 'demo-preview', serverTime: new Date().toISOString() });
  };

  const handleVerifySession = async (sessionCode: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      if (isDemo) {
        if (!DEMO_VALID_SESSION_CODES.includes(sessionCode.toUpperCase())) {
          setVerifyError('Mã phiên mẫu không chính xác.');
          return;
        }
        showDemoResolution(MOCK_QR_TABLE_VERIFIED);
        return;
      }
      const verified = await menuRequest<QRResolution>('/api/public/table-sessions/verify', 'POST', {
        qrCode, sessionCode: sessionCode.trim(),
      });
      // Invalidate any older R01 response before applying the verified DTO.
      const result = cart.applyResolution(verified);
      if (!result.ok) { setVerifyError(result.issue.message); return; }
      // If verification interrupted initial menu loading, complete the shared load.
      if (!cartStore.getState().menuFresh) await cart.refresh();
    } catch (error) {
      setVerifyError(error instanceof MenuApiError ? error.error.message
        : 'Lỗi kết nối máy chủ. Vui lòng kiểm tra đường truyền và thử lại.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 3. Tương tác xem chi tiết & chọn món (Item Detail Sheet P2-G02)
  const handleOpenItemDetail = (item: MenuItem) => {
    setSelectedItemForDetail(item);
    setIsDetailOpen(true);
  };

  const handleSelectItem = (selection: SelectedItemPayload) => {
    // Thêm món vào giỏ hàng qua Cart Facade
    return cartActions.addLine({
      menuItemId: selection.menuItemId,
      quantity: selection.quantity,
      optionIds: selection.optionIds,
      note: selection.note ?? null,
    });
  };

  // NẾU ĐANG PHÂN GIẢI QR (RESOLVING STATE)
  if (isResolving) {
    return <CustomerSkeleton />;
  }

  // NẾU GẶP LỖI PHÂN GIẢI (ERROR STATE: INVALID_QR, NO_SESSION, RATE_LIMITED...)
  if (resolutionErrorState || !resolution) {
    return (
      <div className={`min-h-screen bg-[#F5F6F5] text-[#1D2522] flex flex-col justify-between ${className}`}>
        <div className="w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm flex flex-col pb-12">
          {/* Header trung tính tối giản */}
          <header className="px-4 py-3 border-b border-[#E9ECEA] bg-white flex items-center justify-between">
            <h1 className="text-sm font-bold text-[#1D2522]">{MOCK_STORE.name}</h1>
            <span className="text-xs text-[#727B77]">QR Ordering</span>
          </header>

          <QRResolutionStateView
            state={resolutionErrorState || 'invalid_qr'}
            retryAfterSeconds={retryAfterSec}
            retryAt={isDemo ? undefined : loadError?.retryAt ?? undefined}
            onRetry={handleRetryResolve}
          />
        </div>
      </div>
    );
  }

  // PHÂN BIỆT RẠCH RÒI 2 CHẾ ĐỘ:
  const isTakeaway = resolution.type === 'takeaway';
  const isDineIn = resolution.type === 'table';
  const tableLabel = isDineIn ? resolution.table.label : null;
  const isTableVerified = isDineIn && !resolution.requiresSessionCode;
  const isTableUnverified = isDineIn && resolution.requiresSessionCode;
  const isCheckoutPending = isDineIn && resolution.session?.status === 'checkout_pending';

  return (
    <div
      className={`min-h-screen bg-[#F5F6F5] text-[#1D2522] flex flex-col justify-between ${className}`}
    >
      <div className="w-full max-w-lg mx-auto bg-white min-h-screen shadow-sm flex flex-col relative pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]">
        {/* =================================================================
            1. Header Chuẩn Hóa Theo Chế Độ (Tại bàn / Mang đi)
           ================================================================= */}
        <CustomerOrderModeHeader
          store={resolution.store}
          mode={resolution.mode}
          tableLabel={tableLabel}
          cartItemCount={cartState.totalQuantity}
          activeOrderTicket={activeOrder?.ticketNo}
          onTrackOrder={() => {
            if (activeOrder) {
              router.push(`/order/${encodeURIComponent(activeOrder.id)}?qrCode=${encodeURIComponent(qrCode)}`);
            }
          }}
          onOpenCart={() => setIsCartSheetOpen(true)}
        />

        {/* Thanh gạt chuyển nhanh trạng thái kiểm thử cho QA/Chủ quán (Dev Toolbar - Chỉ hiển thị trong Dev) */}
        {isDemo && (
          <div className="bg-[#FAFBFB] border-b border-[#E9ECEA] px-3 py-1.5 flex items-center justify-between text-[11px] text-[#727B77] overflow-x-auto scrollbar-none">
            <span className="font-semibold text-[#1D725E] flex-shrink-0 mr-2">Chế độ xem (Dev):</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  showDemoResolution(MOCK_QR_TABLE_UNVERIFIED);
                }}
                className={`px-2 py-0.5 rounded transition-colors ${
                  isTableUnverified ? 'bg-[#35977D] text-white font-bold' : 'hover:bg-[#E9ECEA]'
                }`}
              >
                Bàn chưa xác nhận
              </button>
              <button
                type="button"
                onClick={() => {
                  showDemoResolution(MOCK_QR_TABLE_VERIFIED);
                }}
                className={`px-2 py-0.5 rounded transition-colors ${
                  isTableVerified ? 'bg-[#35977D] text-white font-bold' : 'hover:bg-[#E9ECEA]'
                }`}
              >
                Bàn đã xác nhận
              </button>
              <button
                type="button"
                onClick={() => {
                  showDemoResolution(MOCK_QR_TAKEAWAY);
                }}
                className={`px-2 py-0.5 rounded transition-colors ${
                  isTakeaway ? 'bg-[#35977D] text-white font-bold' : 'hover:bg-[#E9ECEA]'
                }`}
              >
                Mang đi
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            2. Khối Nhập Mã Phiên Bàn (Chỉ hiển thị cho QR Bàn Chưa Xác Nhận)
           ================================================================= */}
        {isDineIn && isTableUnverified && (
          <div className="px-4 pt-3 pb-1">
            <TableVerificationCard
              tableLabel={tableLabel || 'Bàn'}
              isVerifying={isVerifying}
              errorMessage={verifyError}
              onVerify={handleVerifySession}
              isVerified={false}
            />
          </div>
        )}

        {/* =================================================================
            2b. Thông báo bàn đã xác nhận (Dine-In Đã Xác Minh)
           ================================================================= */}
        {isDineIn && isTableVerified && (
          <div className="px-4 pt-3 pb-1">
            <TableVerificationCard
              tableLabel={tableLabel || 'Bàn'}
              onVerify={() => {}}
              isVerified={true}
            />
          </div>
        )}

        {/* Cảnh báo bàn đang chờ tính tiền nếu có */}
        {isCheckoutPending && (
          <div className="px-4 pt-2">
            <QRResolutionStateView state="session_locked_or_closed" />
          </div>
        )}

        {/* =================================================================
            2c. Thẻ Theo Dõi Đơn Hàng Đang Chuẩn Bị (Active Order Tracking Card)
           ================================================================= */}
        {activeOrder && (
          <div className="px-4 pt-3 pb-1">
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#E8F4F0] via-white to-[#E8F4F0] border border-[#35977D]/40 shadow-xs flex items-center justify-between gap-3 animate-dialog-card-in">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#1D725E] text-white flex items-center justify-center flex-shrink-0 shadow-xs relative">
                  <ChefHat className="w-5 h-5" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] ring-2 ring-white absolute -top-0.5 -right-0.5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#1D2522]">
                      Đơn #{String(activeOrder.ticketNo).padStart(3, '0')}
                    </span>
                    <span className="text-[10px] font-semibold text-[#1D725E] bg-white px-2 py-0.5 rounded-full border border-[#C6E7DC]">
                      {ORDER_STATUS_LABELS[activeOrder.status as keyof typeof ORDER_STATUS_LABELS] || 'Đang chuẩn bị'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#55605C] truncate mt-0.5">
                    {activeOrder.tableLabel ? `${activeOrder.tableLabel} · ` : ''}
                    {activeOrder.itemCount} phần món · Chạm để xem tiến độ làm món
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  router.push(`/order/${encodeURIComponent(activeOrder.id)}?qrCode=${encodeURIComponent(qrCode)}`);
                }}
                className="px-3 h-9 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] active:scale-95 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-all flex-shrink-0"
              >
                <span>Xem đơn</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================
            3. Vỏ Khung Xem Trước Thực Đơn (Menu Customer Shell P2-G02)
           ================================================================= */}
        <div className="pt-2">
          <MenuPreviewSection
            categories={menuCategories}
            items={menuItems}
            isTableVerified={isTableVerified}
            isTakeaway={isTakeaway}
            isLoading={isMenuLoading}
            isMockPreview={isDemo}
            errorMessage={menuErrorMessage}
            onRetry={handleRetryMenu}
            onItemClick={handleOpenItemDetail}
            onItemAdd={handleOpenItemDetail}
          />
        </div>
      </div>

      {/* =================================================================
          4. Thanh Giỏ Hàng Nổi Đáy (Sticky Cart Preview)
         ================================================================= */}
      {cartState.totalQuantity > 0 && (
        <StickyCartPreview
          itemCount={cartState.totalQuantity}
          totalVnd={cartState.subtotalVnd}
          onOpenCart={() => setIsCartSheetOpen(true)}
        />
      )}

      {/* =================================================================
          5. Khung Trượt Chi Tiết & Tùy Chọn Món Ăn (Item Detail Sheet P2-G02)
         ================================================================= */}
      <ItemDetailSheet
        item={selectedItemForDetail}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        canAddToCart={true}
        isTableVerified={isTableVerified}
        isTakeaway={isTakeaway}
        onSelectItem={handleSelectItem}
      />

      {/* =================================================================
          6. Khung Giỏ Hàng & Xem Lại Đơn (Customer Cart Sheet P2-G03)
         ================================================================= */}
      <CartSheet
        isOpen={isCartSheetOpen}
        onClose={() => setIsCartSheetOpen(false)}
        cartState={cartState}
        cartActions={cartActions}
        readiness={readiness}
        isTakeaway={isTakeaway}
        tableLabel={tableLabel || 'Bàn'}
        storeName={resolution.store.name}
        qrCode={qrCode}
        isTableVerified={isTableVerified}
        menuItems={menuItems}
        isDemo={isDemo}
        onOrderConfirmed={handleOrderConfirmed}
        activeOrder={activeOrder}
        onTrackOrder={(orderId) => {
          router.push(`/order/${encodeURIComponent(orderId)}?qrCode=${encodeURIComponent(qrCode)}`);
        }}
        onGoToVerifyTable={() => {
          const input = document.querySelector<HTMLInputElement>('input[name="sessionCode"]');
          if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
      />
    </div>
  );
};
