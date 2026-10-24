'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, ChevronRight, CheckCircle2, Bell } from 'lucide-react';
import type { QRResolution, MenuCategory, MenuItem, OrderDetail } from '../../../docs/contracts/types';
import { CustomerOrderModeHeader } from './CustomerOrderModeHeader';
import { TableVerificationCard } from './TableVerificationCard';
import { QRResolutionStateView, type QRResolutionUiState } from './QRResolutionStateView';
import { MenuPreviewSection } from './MenuPreviewSection';
import { StickyCartPreview } from './StickyCartPreview';
import { CustomerSkeleton } from './CustomerSkeleton';
import { ItemDetailSheet, type SelectedItemPayload } from './ItemDetailSheet';
import { usePresentationCart, CartSheet } from './cart';
import {
  getActiveOrderSummary,
  saveActiveOrderSummary,
  subscribeActiveOrder,
  isTerminalOrderStatus,
  getOrderStatusBadgeConfig,
  getOrderStatusSubtitle,
  type ActiveOrderSummary,
} from './order/active-order-storage';
import { getCustomerOrderTracking } from '@/features/orders/api-client';
import { createCartStore } from '../../features/cart';
import { menuRequest, MenuApiError } from '../../features/customer/api-client';

interface CustomerQRContainerProps {
  qrCode: string;
  initialResolution?: QRResolution | null;
  categories?: MenuCategory[];
  items?: MenuItem[];
  demoState?: string | null;
  className?: string;
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
  categories = [],
  items = [],
  className = '',
}) => {
  const router = useRouter();
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MenuItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);

  // Lưu giữ thông tin đơn hàng vừa đặt để khách luôn theo dõi được tiến độ
  const [activeOrder, setActiveOrder] = useState<ActiveOrderSummary | null>(() => {
    return getActiveOrderSummary(qrCode);
  });

  // The store owns both R01 and R03. Rendering/subscribing never fetches again.
  const [cartSource] = useState(() => ({
    store: createCartStore({ qrCode }),
  }));
  const cartStore = cartSource.store;
  const { cart, cartState, cartActions, readiness } = usePresentationCart({
    qrCode, store: cartStore,
  });
  const { loadError, refreshing, hydrated, menu } = cart.state;
  const resolution = cart.state.resolution ?? initialResolution;
  const isResolving = cart.state.online && !resolution && (!hydrated || refreshing);
  const resolutionErrorState: QRResolutionUiState | null = !cart.state.online ? 'offline'
    : loadError?.stage !== 'resolution' ? null
    : loadError.status === 429 ? 'rate_limited'
    : loadError.status === 400 || loadError.status === 404 ? 'invalid_qr'
    : loadError.status === 410 ? 'session_locked_or_closed'
    : 'network_error';
  const menuCategories = menu?.categories ?? categories;
  const menuItems = menu?.items ?? items;
  const isMenuLoading = refreshing && !menu;
  const menuErrorMessage = loadError?.stage === 'menu'
    ? loadError.status === 429 ? 'Thao tác quá thường xuyên. Vui lòng chờ trước khi tải lại thực đơn.'
      : 'Không thể tải thực đơn từ máy chủ của quán.'
    : null;

  const handleRetryResolve = () => { void cart.refresh(); };
  const handleRetryMenu = () => { void cart.refresh(); };

  const handleOrderConfirmed = (order: OrderDetail) => {
    const summary: ActiveOrderSummary = {
      id: order.id,
      ticketNo: order.ticketNo ?? 0,
      status: order.status,
      itemCount: order.itemCount,
      totalVnd: order.totalVnd,
      tableLabel: resolution && resolution.type === 'table' ? resolution.table.label : undefined,
      updatedAt: new Date().toISOString(),
    };
    setActiveOrder(summary);
    saveActiveOrderSummary(summary, qrCode);
  };

  // Đồng bộ tức thì khi trạng thái đơn thay đổi từ màn hình khác (như trang theo dõi tiến độ)
  useEffect(() => {
    const unsubscribe = subscribeActiveOrder((updated) => {
      setActiveOrder(updated);
    });

    return unsubscribe;
  }, []);

  // Tự động kiểm tra trạng thái đơn định kỳ và khi chuyển tab để cập nhật trạng thái mới nhất
  useEffect(() => {
    if (!activeOrder || isTerminalOrderStatus(activeOrder.status)) return;

    const orderId = activeOrder.id;
    const tableFallback = activeOrder.tableLabel;
    let cancelled = false;

    const syncActiveOrder = async () => {
      try {
        const fresh = await getCustomerOrderTracking(orderId);
        if (cancelled) return;
        const summary: ActiveOrderSummary = {
          id: fresh.id,
          ticketNo: fresh.ticketNo ?? 0,
          status: fresh.status,
          itemCount: fresh.itemCount,
          totalVnd: fresh.totalVnd,
          tableLabel:
            resolution && resolution.type === 'table'
              ? resolution.table.label
              : fresh.table
                ? fresh.table.label
                : tableFallback,
          updatedAt: new Date().toISOString(),
        };
        setActiveOrder(summary);
        saveActiveOrderSummary(summary, qrCode);
      } catch {
        // im lặng bỏ qua lỗi poll nền
      }
    };

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void syncActiveOrder();
      }
    }, 6000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void syncActiveOrder();
      }
    };

    const handleFocus = () => {
      if (navigator.onLine) {
        void syncActiveOrder();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeOrder, qrCode, resolution]);

  const handleVerifySession = async (sessionCode: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const verified = await menuRequest<QRResolution>('/api/public/table-sessions/verify', 'POST', {
        qrCode, sessionCode: sessionCode.trim(),
      });
      // Invalidate any older R01 response before applying the verified DTO.
      const result = cart.applyResolution(verified);
      if (!result.ok) { setVerifyError(result.issue.message); return; }
      // If verification interrupted initial menu loading, complete the shared load.
      if (!cartStore.getState().menuFresh) await cart.refresh();
    } catch (error) {
      if (error instanceof MenuApiError) {
        if (error.status === 401 || error.status === 400 || error.error.code === 'INVALID_SESSION_CODE') {
          setVerifyError('Mã chưa đúng, vui lòng thử lại.');
        } else if (error.status === 429 || error.error.code === 'RATE_LIMITED') {
          setVerifyError('Bạn thử quá nhiều lần. Hãy đợi một chút rồi thử lại.');
        } else if (error.status === 410 || error.error.code === 'SESSION_EXPIRED' || error.error.code === 'SESSION_CHECKOUT_PENDING') {
          setVerifyError('Phiên bàn đã kết thúc, vui lòng hỏi quán.');
        } else if (error.status === 409 || error.error.code === 'DUPLICATE_REQUEST_CONFLICT') {
          setVerifyError('Mã PIN đã thay đổi. Vui lòng xin mã mới từ chủ quán.');
        } else {
          setVerifyError(error.error.message || 'Mã chưa đúng, vui lòng thử lại.');
        }
      } else {
        setVerifyError('Không thể kết nối. Kiểm tra mạng và thử lại.');
      }
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
            <h1 className="text-sm font-bold text-[#1D2522]">Phở Việt QR</h1>
            <span className="text-xs text-[#727B77]">QR Ordering</span>
          </header>

          <QRResolutionStateView
            state={resolutionErrorState || 'invalid_qr'}
            retryAt={loadError?.retryAt ?? undefined}
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
          activeOrderStatus={activeOrder?.status}
          onTrackOrder={() => {
            if (activeOrder) {
              router.push(`/order/${encodeURIComponent(activeOrder.id)}?qrCode=${encodeURIComponent(qrCode)}`);
            }
          }}
          onOpenCart={() => setIsCartSheetOpen(true)}
        />

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
        {activeOrder && (() => {
          const statusConfig = getOrderStatusBadgeConfig(activeOrder.status);
          const isDone = statusConfig.isCompleted;
          const isReady = activeOrder.status === 'ready';

          return (
            <div className="px-4 pt-3 pb-1">
              <div
                className={`p-3.5 rounded-2xl border shadow-xs flex items-center justify-between gap-3 animate-dialog-card-in ${
                  isDone
                    ? 'bg-gradient-to-r from-[#ECFDF3] via-white to-[#ECFDF3] border-[#ABEFC6]'
                    : isReady
                    ? 'bg-gradient-to-r from-[#EFF8FF] via-white to-[#EFF8FF] border-[#B2DDFF]'
                    : 'bg-gradient-to-r from-[#E8F4F0] via-white to-[#E8F4F0] border-[#35977D]/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs relative ${
                      isDone
                        ? 'bg-[#027A48] text-white'
                        : isReady
                        ? 'bg-[#175CD3] text-white'
                        : 'bg-[#1D725E] text-white'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : isReady ? (
                      <Bell className="w-5 h-5" />
                    ) : (
                      <ChefHat className="w-5 h-5" />
                    )}
                    {!isDone && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] ring-2 ring-white absolute -top-0.5 -right-0.5 animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1D2522]">
                        Đơn #{String(activeOrder.ticketNo).padStart(3, '0')}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusConfig.badgeClass}`}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#55605C] truncate mt-0.5">
                      {getOrderStatusSubtitle(activeOrder, true)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    router.push(
                      `/order/${encodeURIComponent(activeOrder.id)}?qrCode=${encodeURIComponent(qrCode)}`
                    );
                  }}
                  className={`px-3 h-9 rounded-xl active:scale-95 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-all flex-shrink-0 ${
                    isDone
                      ? 'bg-[#027A48] hover:bg-[#05603A]'
                      : isReady
                      ? 'bg-[#175CD3] hover:bg-[#124baf]'
                      : 'bg-[#1D725E] hover:bg-[#165B4B]'
                  }`}
                >
                  <span>Xem đơn</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })()}

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
            isMockPreview={false}
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
        isDemo={false}
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
