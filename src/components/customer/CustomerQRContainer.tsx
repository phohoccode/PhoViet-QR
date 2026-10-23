'use client';

import React, { useState, useEffect } from 'react';
import type { QRResolution, MenuCategory, MenuItem } from '../../../docs/contracts/types';
import { CustomerOrderModeHeader } from './CustomerOrderModeHeader';
import { TableVerificationCard } from './TableVerificationCard';
import { QRResolutionStateView, type QRResolutionUiState } from './QRResolutionStateView';
import { MenuPreviewSection } from './MenuPreviewSection';
import { StickyCartPreview } from './StickyCartPreview';
import { CustomerSkeleton } from './CustomerSkeleton';
import { ItemDetailSheet, type SelectedItemPayload } from './ItemDetailSheet';
import { fetchPublicMenu } from '../../features/customer/api-client';
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
  initialResolution = null,
  categories = MOCK_CATEGORIES,
  items = MOCK_MENU_ITEMS,
  demoState = null,
  className = '',
}) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const demoSetup = computeDemoResolution(demoState, initialResolution);

  // Trạng thái phân giải QR
  const [resolution, setResolution] = useState<QRResolution | null>(demoSetup.res);
  const [isResolving, setIsResolving] = useState<boolean>(!demoSetup.res && !demoSetup.err);
  const [resolutionErrorState, setResolutionErrorState] = useState<QRResolutionUiState | null>(
    demoSetup.err
  );
  const [retryAfterSec, setRetryAfterSec] = useState<number | undefined>(demoSetup.retrySec);

  // Trạng thái menu thực tế / mock
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>(isDev ? categories : []);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(isDev ? items : []);
  const [isMenuLoading, setIsMenuLoading] = useState<boolean>(true);
  const [menuErrorMessage, setMenuErrorMessage] = useState<string | null>(null);
  const [isMockPreview, setIsMockPreview] = useState<boolean>(false);

  // Trạng thái xem chi tiết món ăn (Item Detail Sheet P2-G02)
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MenuItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  // Trạng thái xác thực phiên bàn
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);

  // 1. Phân giải QR code thực tế từ máy chủ (R01 GET /api/public/qr/[code])
  useEffect(() => {
    // Nếu đã có kết quả từ demo hoặc SSR initial
    if (resolution || resolutionErrorState) {
      return;
    }

    let isMounted = true;

    fetch(`/api/public/qr/${encodeURIComponent(qrCode)}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!isMounted) return;

        if (res.ok) {
          const json = await res.json();
          if (json?.data) {
            setResolution(json.data);
            setIsResolving(false);
            return;
          }
        }

        // Xử lý chi tiết các mã lỗi theo handoff P2-C01
        let errJson: {
          error?: {
            code?: string;
            message?: string;
            details?: { retryAfterSeconds?: number };
          };
        } | null = null;
        try {
          errJson = await res.json();
        } catch {
          // Response không phải JSON hợp lệ
        }

        const retryHeader = res.headers.get('Retry-After');
        const retrySec =
          errJson?.error?.details?.retryAfterSeconds ||
          (retryHeader ? parseInt(retryHeader, 10) : undefined);

        if (res.status === 429) {
          setRetryAfterSec(retrySec || 30);
          setResolution(null);
          setResolutionErrorState('rate_limited');
          setIsResolving(false);
          return;
        }

        if (res.status === 404 || res.status === 400) {
          setResolution(null);
          setResolutionErrorState('invalid_qr');
          setIsResolving(false);
          return;
        }

        if (res.status === 410) {
          setResolution(null);
          setResolutionErrorState('session_locked_or_closed');
          setIsResolving(false);
          return;
        }

        // Trong production: Hiển thị lỗi máy chủ thực tế, tuyệt đối không dùng mock
        if (!isDev) {
          setResolution(null);
          setResolutionErrorState('offline');
          setIsResolving(false);
          return;
        }

        // Fallback dev preview an toàn khi chạy offline không có API backend
        const isTakeawayCode =
          qrCode.toLowerCase().includes('takeaway') || qrCode.toLowerCase().includes('quay');
        setResolution(isTakeawayCode ? MOCK_QR_TAKEAWAY : MOCK_QR_TABLE_UNVERIFIED);
        setIsResolving(false);
      })
      .catch(() => {
        if (!isMounted) return;
        if (!isDev) {
          setResolution(null);
          setResolutionErrorState('offline');
          setIsResolving(false);
          return;
        }
        const isTakeawayCode =
          qrCode.toLowerCase().includes('takeaway') || qrCode.toLowerCase().includes('quay');
        setResolution(isTakeawayCode ? MOCK_QR_TAKEAWAY : MOCK_QR_TABLE_UNVERIFIED);
        setIsResolving(false);
      });

    return () => {
      isMounted = false;
    };
  }, [qrCode, resolution, resolutionErrorState, isDev]);

  // Thao tác thử lại khi gặp lỗi
  const handleRetryResolve = () => {
    setIsResolving(true);
    setResolutionErrorState(null);
    setResolution(null);
    setRetryAfterSec(undefined);
  };

  // 2. Thao tác xác thực phiên bàn (R02 POST /api/public/table-sessions/verify)
  const handleVerifySession = async (sessionCode: string) => {
    setIsVerifying(true);
    setVerifyError(null);

    try {
      const res = await fetch('/api/public/table-sessions/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode,
          sessionCode: sessionCode.trim(),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setResolution(json.data);
          setIsVerifying(false);
          setVerifyError(null);
          return;
        }
      }

      // Xử lý mã lỗi trả về từ API backend thực tế
      let errorMsg = '';
      try {
        const errJson = await res.json();
        errorMsg = errJson?.error?.message || '';
      } catch {
        // Response rỗng hoặc không parse được JSON
      }

      if (res.status === 422) {
        setVerifyError(
          errorMsg || 'Mã phiên không chính xác. Vui lòng kiểm tra lại với nhân viên quán.'
        );
        setIsVerifying(false);
        return;
      }

      if (res.status === 410) {
        setVerifyError(
          errorMsg || 'Phiên bàn này đã đóng hoặc mã đã hết hạn. Vui lòng nhờ nhân viên mở bàn mới.'
        );
        setIsVerifying(false);
        return;
      }

      if (res.status === 429) {
        setVerifyError(
          errorMsg || 'Thao tác quá thường xuyên. Vui lòng đợi trong giây lát rồi thử lại.'
        );
        setIsVerifying(false);
        return;
      }

      if (res.status === 409) {
        setVerifyError(
          errorMsg || 'Bàn đang ở trạng thái không thể nhận thêm thao tác.'
        );
        setIsVerifying(false);
        return;
      }

      if (res.status === 400) {
        setVerifyError(
          errorMsg || 'Định dạng mã phiên không hợp lệ. Vui lòng kiểm tra lại.'
        );
        setIsVerifying(false);
        return;
      }

      // 403, 404, 500 hoặc lỗi khác
      setVerifyError(
        errorMsg || 'Không thể xác minh phiên bàn. Vui lòng liên hệ nhân viên quán.'
      );
      setIsVerifying(false);
      return;
    } catch {
      // Lỗi mạng hoặc server không phản hồi
      if (!isDev) {
        setVerifyError('Lỗi kết nối máy chủ. Vui lòng kiểm tra đường truyền và thử lại.');
        setIsVerifying(false);
        return;
      }
    }

    // CHỈ DÀNH RIÊNG CHO MÔI TRƯỜNG DEV/PREVIEW KHI SERVER CODEX CHƯA CHẠY:
    if (isDev) {
      setTimeout(() => {
        setIsVerifying(false);
        const isCodeValid =
          DEMO_VALID_SESSION_CODES.includes(sessionCode.toUpperCase()) || sessionCode === '8821';
        if (isCodeValid) {
          setResolution({
            type: 'table',
            mode: 'dine_in',
            store: resolution?.store || MOCK_STORE,
            table: resolution?.table || { id: 'c0200000-0000-4000-8000-000000000002', label: 'Bàn 01' },
            requiresSessionCode: false,
            session: { id: 'c0200000-0000-4000-8000-000000000010', status: 'open' },
          });
        } else {
          setVerifyError('Mã phiên không chính xác. (Mã mẫu hợp lệ dev: 8821 hoặc MOC88)');
        }
      }, 350);
    }
  };

  // 1b. Nạp thực đơn từ backend R03 (GET /api/public/menu?qrCode=...)
  useEffect(() => {
    let isMounted = true;

    fetchPublicMenu(qrCode)
      .then((data) => {
        if (!isMounted) return;
        if (data && data.categories && data.items) {
          // Lọc các món active (đảm bảo không lọt item inactive vào menu khách)
          const activeOnly = data.items.filter(
            (it) => (it as unknown as { active?: boolean }).active !== false
          );
          setMenuCategories(data.categories);
          setMenuItems(activeOnly);
          setIsMockPreview(false);
        }
        setIsMenuLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        if (isDev) {
          setMenuCategories(categories);
          setMenuItems(items);
          setIsMockPreview(true);
          setIsMenuLoading(false);
        } else {
          setMenuCategories([]);
          setMenuItems([]);
          setMenuErrorMessage('Không thể tải thực đơn từ máy chủ của quán.');
          setIsMenuLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [qrCode, isDev, categories, items]);

  const handleRetryMenu = () => {
    setIsMenuLoading(true);
    setMenuErrorMessage(null);
    fetchPublicMenu(qrCode)
      .then((data) => {
        if (data && data.categories && data.items) {
          const activeOnly = data.items.filter(
            (it) => (it as unknown as { active?: boolean }).active !== false
          );
          setMenuCategories(data.categories);
          setMenuItems(activeOnly);
          setIsMockPreview(false);
        }
        setIsMenuLoading(false);
      })
      .catch(() => {
        if (isDev) {
          setMenuCategories(categories);
          setMenuItems(items);
          setIsMockPreview(true);
          setIsMenuLoading(false);
        } else {
          setMenuCategories([]);
          setMenuItems([]);
          setMenuErrorMessage('Không thể tải thực đơn từ máy chủ của quán.');
          setIsMenuLoading(false);
        }
      });
  };

  // 3. Tương tác xem chi tiết & chọn món (Item Detail Sheet P2-G02)
  const handleOpenItemDetail = (item: MenuItem) => {
    setSelectedItemForDetail(item);
    setIsDetailOpen(true);
  };

  const handleSelectItem = (selection: SelectedItemPayload) => {
    // Presentation preview event: Cập nhật badge số lượng và giá tạm tính nổi
    setCartCount((prev) => prev + selection.quantity);
    setCartTotal((prev) => prev + selection.previewTotalVnd);
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
          cartItemCount={cartCount}
          onOpenCart={() => {}}
        />

        {/* Thanh gạt chuyển nhanh trạng thái kiểm thử cho QA/Chủ quán (Dev Toolbar - Chỉ hiển thị trong Dev) */}
        {isDev && (
          <div className="bg-[#FAFBFB] border-b border-[#E9ECEA] px-3 py-1.5 flex items-center justify-between text-[11px] text-[#727B77] overflow-x-auto scrollbar-none">
            <span className="font-semibold text-[#1D725E] flex-shrink-0 mr-2">Chế độ xem (Dev):</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setResolution(MOCK_QR_TABLE_UNVERIFIED);
                  setResolutionErrorState(null);
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
                  setResolution(MOCK_QR_TABLE_VERIFIED);
                  setResolutionErrorState(null);
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
                  setResolution(MOCK_QR_TAKEAWAY);
                  setResolutionErrorState(null);
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
            3. Vỏ Khung Xem Trước Thực Đơn (Menu Customer Shell P2-G02)
           ================================================================= */}
        <div className="pt-2">
          <MenuPreviewSection
            categories={menuCategories}
            items={menuItems}
            isTableVerified={isTableVerified}
            isTakeaway={isTakeaway}
            isLoading={isMenuLoading}
            isMockPreview={isMockPreview}
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
      {cartCount > 0 && (
        <StickyCartPreview
          itemCount={cartCount}
          totalVnd={cartTotal}
          onOpenCart={() => {}}
        />
      )}

      {/* =================================================================
          5. Khung Trượt Chi Tiết & Tùy Chọn Món Ăn (Item Detail Sheet P2-G02)
         ================================================================= */}
      <ItemDetailSheet
        item={selectedItemForDetail}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        canAddToCart={isTakeaway || isTableVerified}
        onSelectItem={handleSelectItem}
      />
    </div>
  );
};
