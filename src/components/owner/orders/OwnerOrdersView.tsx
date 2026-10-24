'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Info,
  Inbox,
  Loader2,
} from 'lucide-react';
import type {
  OwnerOrdersQuery,
  OwnerOrdersView as ApiOwnerOrdersView,
  OrderSummary,
  OrderDetail,
} from '../../../../docs/contracts/types';
import {
  getOwnerOrders,
  claimNextOrder,
  markOrderReady,
  completeOrder,
  MenuApiError,
} from '@/features/owner/api-client';
import { QueueHeader } from './QueueHeader';
import {
  OrderFilters,
  type QueueViewType,
  type OrderTypeFilter,
  type OrderStatusFilter,
} from './OrderFilters';
import { OrderQueueCard } from './OrderQueueCard';
import { ClaimNextButton } from './ClaimNextButton';
import { OrderDetailPanel } from './OrderDetailPanel';
import { TakeawayPickupVerificationDialog } from './TakeawayPickupVerificationDialog';
import { OrdersQueueSkeleton, OrderDetailSkeleton } from '../OwnerTabSkeletons';

export interface OwnerOrdersViewProps {
  initialOrders?: OrderDetail[];
  storeName?: string;
  className?: string;
}

interface ToastNotice {
  type: 'success' | 'info' | 'error';
  message: string;
}

/**
 * OwnerOrdersView — Giao diện Tab Đơn hàng chuẩn Minimal Emerald POS (P3-G02).
 * - Bố cục Desktop (>=1024px) 70/30: Cột trái hàng đợi scrollable, cột phải chi tiết phiếu đơn.
 * - Bố cục Mobile/Tablet (<1024px): 1 cột mượt mà, chạm thẻ mở Sheet chi tiết.
 * - Kết nối thực tế API Codex:
 *   + R07: GET /api/owner/orders (danh sách + đếm số lượng toàn quán + detail trong 1 MVCC snapshot)
 *   + R08: POST /api/owner/queue/claim-next (tiếp nhận đơn theo đúng FIFO với stable requestId)
 *   + R09: POST /api/owner/orders/:id/ready (chuyển đơn preparing sang ready)
 *   + R10: POST /api/owner/orders/:id/complete (chuyển đơn ready Dine-in sang completed)
 * - Tuyệt đối tuân thủ FIFO: Không có nút claim trên từng thẻ riêng lẻ; chỉ nhận việc qua nút trung tâm.
 */
export const OwnerOrdersView: React.FC<OwnerOrdersViewProps> = ({
  initialOrders = [],
  className = '',
}) => {
  // 1. Trạng thái bộ lọc
  const [view, setView] = useState<QueueViewType>('queue');
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');

  // 2. Trạng thái dữ liệu đơn hàng
  const [orders, setOrders] = useState<OrderSummary[]>(initialOrders);
  const [counts, setCounts] = useState<{
    accepted: number;
    preparing: number;
    ready: number;
    paymentException: number;
  }>({
    accepted: initialOrders.filter((o) => o.status === 'accepted').length,
    preparing: initialOrders.filter((o) => o.status === 'preparing').length,
    ready: initialOrders.filter((o) => o.status === 'ready').length,
    paymentException: 0,
  });

  // 3. Đơn hàng đang được chọn xem chi tiết
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrders[0]?.id || null
  );
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(
    initialOrders[0] || null
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // 4. Trạng thái loading / lỗi / polling / pagination (F05)
  const [isLoading, setIsLoading] = useState<boolean>(initialOrders.length === 0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // 5. Trạng thái thao tác FIFO (Claim Next) & Transition
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [pendingActionType, setPendingActionType] = useState<'ready' | 'complete' | null>(null);

  // 6. Thông báo Toast nổi
  const [toast, setToast] = useState<ToastNotice | null>(null);

  // 7. Sheet chi tiết trên mobile
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);
  const [isSheetClosing, setIsSheetClosing] = useState<boolean>(false);

  // 8. Dialog xác minh mã nhận món mang đi (P4-G03)
  const [takeawayVerifyingOrder, setTakeawayVerifyingOrder] = useState<OrderDetail | null>(null);

  // Stable UUID ref cho claim FIFO
  const claimRequestIdRef = useRef<string | null>(null);

  // F02: Immutable transition intent ref { action, orderId, expectedVersion, requestId, type }
  const pendingTransitionRef = useRef<{
    action: 'ready' | 'complete';
    orderId: string;
    expectedVersion: number;
    requestId: string;
    type?: 'dine_in' | 'takeaway';
  } | null>(null);

  // F04: Generation guards chống race condition khi lọc, poll hoặc đổi selection
  const fetchGenerationRef = useRef<number>(0);
  const detailGenerationRef = useRef<number>(0);

  // Polling timer ref
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadOrdersRef = useRef<(() => Promise<void>) | null>(null);

  // Bộ nhớ theo dõi ID đơn đã hiển thị để gộp thông báo khi nhiều đơn mới đến (P6-G02)
  const knownOrderIdsRef = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));
  const hasLoadedOnceRef = useRef<boolean>(initialOrders.length > 0);

  const showToast = useCallback((type: 'success' | 'info' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 4000);
  }, []);

  const selectedOrderIdRef = useRef<string | null>(selectedOrderId);
  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId;
  }, [selectedOrderId]);

  // Xử lý chuyển đổi giữa các tab Hàng đợi / Lịch sử / Thanh toán
  const handleViewChange = useCallback((newView: QueueViewType) => {
    if (newView === view) return;
    selectedOrderIdRef.current = null;
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setIsLoading(true);
    setErrorMessage(null);
    setView(newView);
    setStatusFilter('all');
  }, [view]);

  // Xử lý chuyển đổi loại đơn (Tất cả / Tại bàn / Mang đi)
  const handleTypeChange = useCallback((newType: OrderTypeFilter) => {
    if (newType === typeFilter) return;
    setIsLoading(true);
    setErrorMessage(null);
    setTypeFilter(newType);
  }, [typeFilter]);

  // Xử lý chuyển đổi tab trạng thái
  const handleStatusChange = useCallback((newStatus: OrderStatusFilter) => {
    if (newStatus === statusFilter) return;
    setIsLoading(true);
    setErrorMessage(null);
    setStatusFilter(newStatus);
  }, [statusFilter]);

  // Xây dựng query chuẩn tuân thủ API contract R07
  const buildQuery = useCallback(
    (targetOrderId?: string | null): OwnerOrdersQuery => {
      const q: OwnerOrdersQuery = {
        view,
        limit: 50,
      };

      if (typeFilter !== 'all') {
        q.type = typeFilter;
      }

      if (statusFilter !== 'all') {
        q.status = statusFilter;
      }

      const activeOrderId = targetOrderId !== undefined ? targetOrderId : selectedOrderIdRef.current;
      if (activeOrderId) {
        q.orderId = activeOrderId;
      }

      return q;
    },
    [view, typeFilter, statusFilter]
  );

  // Nạp danh sách đơn hàng từ API R07 với generation guard (F04) và pagination cursor (F05)
  const loadOrders = useCallback(
    async (isManual = false) => {
      const fetchGen = ++fetchGenerationRef.current;
      if (isManual) {
        setIsRefreshing(true);
        setErrorMessage(null);
      }

      try {
        const query = buildQuery();
        const data: ApiOwnerOrdersView = await getOwnerOrders(query);

        // F04: Bỏ qua kết quả cũ nếu đã có truy vấn mới hơn vượt mặt
        if (fetchGen !== fetchGenerationRef.current) return;

        // Phát hiện và gộp thông báo khi có đợt nhiều đơn mới đến (P6-G02)
        if (hasLoadedOnceRef.current && data.orders.length > 0) {
          const freshAccepted = data.orders.filter(
            (o) => !knownOrderIdsRef.current.has(o.id) && o.status === 'accepted'
          );
          if (freshAccepted.length > 1) {
            showToast('info', `Có ${freshAccepted.length} đơn mới trong hàng đợi.`);
          } else if (freshAccepted.length === 1) {
            const ticket = freshAccepted[0].ticketNo
              ? `#${String(freshAccepted[0].ticketNo).padStart(3, '0')}`
              : `#${freshAccepted[0].id.slice(0, 6)}`;
            showToast('info', `Có đơn mới ${ticket} trong hàng đợi.`);
          }
        }
        hasLoadedOnceRef.current = true;
        data.orders.forEach((o) => knownOrderIdsRef.current.add(o.id));

        setOrders(data.orders);
        setCounts(data.counts);
        setNextCursor(data.nextCursor);
        setLastUpdated(new Date());

        // Cập nhật chi tiết đơn đang chọn nếu server trả về trong snapshot
        if (data.detail) {
          setSelectedOrder(data.detail);
        } else if (selectedOrderId && !data.orders.some((o) => o.id === selectedOrderId)) {
          // Nếu đơn đã biến mất khỏi filter hiện tại
          setSelectedOrder(null);
        }

        // Lên lịch poll lần tiếp theo sau 6 giây (5–8s khuyến nghị) nếu màn hình hiển thị
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrdersRef.current?.();
          }
        }, 6000);
      } catch (err: unknown) {
        if (fetchGen !== fetchGenerationRef.current) return;

        if (err instanceof MenuApiError) {
          if (err.status === 401 || err.status === 403) {
            setErrorMessage('Phiên làm việc hết hạn hoặc bạn không có quyền xem danh sách đơn hàng.');
            return;
          }
          if (err.status === 429) {
            const waitMs = Math.max(10, err.retryAfterSeconds ?? 15) * 1000;
            setErrorMessage('Thao tác hơi nhanh. Đang tự động giãn cách cập nhật hàng đợi.');
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
            pollTimerRef.current = setTimeout(() => {
              if (document.visibilityState === 'visible' && navigator.onLine) {
                void loadOrdersRef.current?.();
              }
            }, waitMs);
            return;
          }
          setErrorMessage(err.error.message || 'Không thể tải danh sách đơn hàng.');
        } else {
          setErrorMessage('Mất kết nối mạng. Vui lòng kiểm tra đường truyền.');
        }

        // Backoff lên 30s khi gặp lỗi
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrdersRef.current?.();
          }
        }, 30000);
      } finally {
        if (fetchGen === fetchGenerationRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingDetail(false);
        }
      }
    },
    [buildQuery, selectedOrderId, showToast]
  );

  // F05: Tải thêm đơn theo keyset pagination khi có nextCursor
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const query = buildQuery();
      query.cursor = nextCursor;
      const data: ApiOwnerOrdersView = await getOwnerOrders(query);

      // Deduplicate orders by ID khi nối trang
      setOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const newOrders = data.orders.filter((o) => !existingIds.has(o.id));
        return [...prev, ...newOrders];
      });
      setNextCursor(data.nextCursor);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        showToast('error', err.error.message || 'Không thể tải thêm đơn cũ.');
      } else {
        showToast('error', 'Lỗi mạng khi tải thêm đơn hàng.');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, buildQuery, showToast]);

  useEffect(() => {
    loadOrdersRef.current = () => loadOrders(false);
  });

  // Tải lần đầu và khi bộ lọc thay đổi (Hiệu ứng loading mượt mà khi đổi tab)
  useEffect(() => {
    let cancelled = false;
    const fetchGen = ++fetchGenerationRef.current;

    void (async () => {
      try {
        const query = buildQuery(selectedOrderIdRef.current);
        const data: ApiOwnerOrdersView = await getOwnerOrders(query);
        if (cancelled || fetchGen !== fetchGenerationRef.current) return;

        setOrders(data.orders);
        setCounts(data.counts);
        setNextCursor(data.nextCursor);
        setLastUpdated(new Date());

        if (data.detail) {
          setSelectedOrder(data.detail);
          setSelectedOrderId(data.detail.id);
          selectedOrderIdRef.current = data.detail.id;
        } else if (data.orders.length > 0) {
          const match = selectedOrderIdRef.current && data.orders.some((o) => o.id === selectedOrderIdRef.current);
          if (!match) {
            const firstId = data.orders[0].id;
            setSelectedOrderId(firstId);
            selectedOrderIdRef.current = firstId;
            void (async () => {
              try {
                const detailRes = await getOwnerOrders({ orderId: firstId, limit: 1 });
                if (!cancelled && fetchGen === fetchGenerationRef.current && detailRes.detail) {
                  setSelectedOrder(detailRes.detail);
                }
              } catch {
                // Giữ nguyên fallback
              }
            })();
          }
        } else {
          setSelectedOrderId(null);
          setSelectedOrder(null);
          selectedOrderIdRef.current = null;
        }

        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void loadOrdersRef.current?.();
          }
        }, 6000);
      } catch (err: unknown) {
        if (cancelled || fetchGen !== fetchGenerationRef.current) return;
        if (err instanceof MenuApiError) {
          if (err.status === 401 || err.status === 403) {
            setErrorMessage('Phiên làm việc hết hạn hoặc không có quyền.');
          } else {
            setErrorMessage(err.error.message || 'Không thể tải đơn hàng.');
          }
        } else {
          setErrorMessage('Mất kết nối mạng. Vui lòng kiểm tra đường truyền.');
        }
      } finally {
        if (!cancelled && fetchGen === fetchGenerationRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view, typeFilter, statusFilter, buildQuery]);

  // Lắng nghe visibility change & online events
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadOrders(false);
      }
    };

    const handleOnline = () => {
      void loadOrders(false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [loadOrders]);

  // Chọn xem chi tiết một đơn (F04: Có generation guard)
  const handleSelectOrder = useCallback(
    async (orderId: string) => {
      setSelectedOrderId(orderId);
      setIsMobileSheetOpen(true);

      // Nếu đơn này đã có lines trong selectedOrder hiện tại
      if (selectedOrder && selectedOrder.id === orderId && selectedOrder.lines) {
        return;
      }

      const detailGen = ++detailGenerationRef.current;
      setIsLoadingDetail(true);
      try {
        const data = await getOwnerOrders({ orderId, limit: 1 });
        if (detailGen !== detailGenerationRef.current) return;
        if (data.detail) {
          setSelectedOrder(data.detail);
        }
      } catch {
        if (detailGen !== detailGenerationRef.current) return;
        // Fallback: tìm trong initialOrders nếu có
        const found = initialOrders.find((o) => o.id === orderId);
        if (found) setSelectedOrder(found);
      } finally {
        if (detailGen === detailGenerationRef.current) {
          setIsLoadingDetail(false);
        }
      }
    },
    [initialOrders, selectedOrder]
  );

  // =========================================================================
  // THAO TÁC 1: TIẾP NHẬN ĐƠN THEO FIFO (R08 POST /api/owner/queue/claim-next)
  // =========================================================================
  const handleClaimNext = useCallback(async () => {
    if (isClaiming) return;

    setIsClaiming(true);

    if (!claimRequestIdRef.current) {
      claimRequestIdRef.current = crypto.randomUUID();
    }
    const targetRequestId = claimRequestIdRef.current;

    try {
      const claimedOrder = await claimNextOrder({ requestId: targetRequestId });

      // Thành công: hủy requestId chờ
      claimRequestIdRef.current = null;

      if (!claimedOrder) {
        // Queue trống: thông báo thân thiện
        showToast('info', 'Hiện chưa có đơn nào đang chờ làm trong hàng đợi.');
        await loadOrders(false);
        return;
      }

      // Đã nhận được đơn cũ nhất theo FIFO: tự động chọn đơn này
      setSelectedOrderId(claimedOrder.id);
      setSelectedOrder(claimedOrder);
      const ticketStr = claimedOrder.ticketNo
        ? `#${String(claimedOrder.ticketNo).padStart(3, '0')}`
        : `#${claimedOrder.id.slice(0, 6)}`;
      showToast('success', `Đã tiếp nhận đơn ${ticketStr} vào danh sách đang làm.`);

      // Refresh lại danh sách và đếm số lượng
      await loadOrders(false);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.status === 409) {
          // Xung đột chuyển trạng thái: refetch lại
          claimRequestIdRef.current = null;
          showToast('error', 'Hàng đợi vừa được cập nhật bởi thao tác khác. Đang làm mới...');
          await loadOrders(false);
        } else if (err.status === 401 || err.status === 403) {
          claimRequestIdRef.current = null;
          showToast('error', 'Bạn không có quyền thực hiện tiếp nhận đơn hàng.');
        } else if (err.status >= 500) {
          // Lỗi 500: trạng thái không chắc chắn -> giữ nguyên claimRequestIdRef để retry an toàn
          showToast('error', 'Máy chủ gặp sự cố trong khi tiếp nhận. Bấm lại để kiểm tra.');
        } else {
          claimRequestIdRef.current = null;
          showToast('error', err.error.message || 'Không thể tiếp nhận đơn.');
        }
      } else {
        // Lỗi mạng: giữ requestId
        showToast('error', 'Mất kết nối mạng. Hãy bấm thử lại để tiếp tục.');
      }
    } finally {
      setIsClaiming(false);
    }
  }, [isClaiming, loadOrders, showToast]);

  // =========================================================================
  // THAO TÁC 2: ĐÁNH DẤU MÓN ĐÃ LÀM XONG (R09 POST /api/owner/orders/:id/ready)
  // F02: Ghi nhận immutable transition intent để tránh race condition khi poll/select
  // =========================================================================
  const handleMarkReady = useCallback(
    async (order: OrderDetail) => {
      if (isActionPending) return;

      let intent = pendingTransitionRef.current;
      if (intent) {
        if (intent.orderId !== order.id || intent.action !== 'ready') {
          showToast('error', 'Đang có thao tác chuyển trạng thái đơn hàng khác chưa hoàn tất.');
          return;
        }
      } else {
        intent = {
          action: 'ready',
          orderId: order.id,
          expectedVersion: order.version,
          requestId: crypto.randomUUID(),
        };
        pendingTransitionRef.current = intent;
      }

      setIsActionPending(true);
      setPendingActionType('ready');

      try {
        const updatedOrder = await markOrderReady(intent.orderId, {
          requestId: intent.requestId,
          expectedVersion: intent.expectedVersion,
        });

        pendingTransitionRef.current = null;
        setSelectedOrder(updatedOrder);
        showToast('success', `Đơn #${updatedOrder.ticketNo || ''} đã sẵn sàng phục vụ.`);
        await loadOrders(false);
      } catch (err: unknown) {
        if (err instanceof MenuApiError) {
          if (err.status === 409) {
            pendingTransitionRef.current = null;
            if (err.error.code === 'PAYMENT_REVIEW_REQUIRED') {
              showToast('error', 'Đơn hàng đang cần đối soát thanh toán. Không thể chuyển sang sẵn sàng.');
            } else {
              showToast('error', 'Trạng thái đơn hàng đã được cập nhật ở nơi khác. Đang làm mới...');
            }
            await loadOrders(false);
          } else if (err.status >= 500) {
            showToast('error', 'Máy chủ gặp sự cố trong khi xử lý. Bấm lại để thử lại với đúng yêu cầu ban đầu.');
          } else {
            pendingTransitionRef.current = null;
            showToast('error', err.error.message || 'Không thể đánh dấu sẵn sàng.');
          }
        } else {
          showToast('error', 'Mất kết nối mạng. Hãy bấm thử lại để tiếp tục với đúng yêu cầu ban đầu.');
        }
      } finally {
        setIsActionPending(false);
        setPendingActionType(null);
      }
    },
    [isActionPending, loadOrders, showToast]
  );

  // =========================================================================
  // THAO TÁC 3: ĐÁNH DẤU ĐÃ PHỤC VỤ (R10 POST /api/owner/orders/:id/complete)
  // F02: Ghi nhận immutable transition intent để tránh race condition khi poll/select
  // =========================================================================
  const handleComplete = useCallback(
    async (order: OrderDetail) => {
      if (isActionPending) return;

      if (order.type !== 'dine_in') {
        setTakeawayVerifyingOrder(order);
        return;
      }

      let intent = pendingTransitionRef.current;
      if (intent) {
        if (intent.orderId !== order.id || intent.action !== 'complete') {
          showToast('error', 'Đang có thao tác chuyển trạng thái đơn hàng khác chưa hoàn tất.');
          return;
        }
      } else {
        intent = {
          action: 'complete',
          orderId: order.id,
          expectedVersion: order.version,
          requestId: crypto.randomUUID(),
          type: 'dine_in',
        };
        pendingTransitionRef.current = intent;
      }

      setIsActionPending(true);
      setPendingActionType('complete');

      try {
        const updatedOrder = await completeOrder(intent.orderId, {
          requestId: intent.requestId,
          expectedVersion: intent.expectedVersion,
          type: 'dine_in',
        });

        pendingTransitionRef.current = null;
        setSelectedOrder(updatedOrder);
        showToast('success', `Đơn #${updatedOrder.ticketNo || ''} đã hoàn tất phục vụ.`);
        await loadOrders(false);
      } catch (err: unknown) {
        if (err instanceof MenuApiError) {
          if (err.status === 409) {
            pendingTransitionRef.current = null;
            if (err.error.code === 'PAYMENT_REVIEW_REQUIRED') {
              showToast('error', 'Đơn hàng đang cần đối soát thanh toán. Không thể giao món.');
            } else {
              showToast('error', 'Đơn hàng đã được hoàn thành ở nơi khác. Đang làm mới...');
            }
            await loadOrders(false);
          } else if (err.status >= 500) {
            showToast('error', 'Máy chủ gặp sự cố trong khi xử lý. Bấm lại để thử lại với đúng yêu cầu ban đầu.');
          } else {
            pendingTransitionRef.current = null;
            showToast('error', err.error.message || 'Không thể xác nhận hoàn thành đơn.');
          }
        } else {
          showToast('error', 'Mất kết nối mạng. Hãy bấm thử lại để tiếp tục với đúng yêu cầu ban đầu.');
        }
      } finally {
        setIsActionPending(false);
        setPendingActionType(null);
      }
    },
    [isActionPending, loadOrders, showToast]
  );

  // Mở dialog xác minh mã nhận món mang đi
  const handleVerifyTakeawayPickup = useCallback((order: OrderDetail) => {
    setTakeawayVerifyingOrder(order);
  }, []);

  // Xác nhận giao món mang đi qua R10 (completeOrder với type: 'takeaway', pickupCode)
  const handleConfirmTakeawayPickup = useCallback(
    async (order: OrderDetail, pickupCode: string, requestId: string) => {
      const updatedOrder = await completeOrder(order.id, {
        requestId,
        expectedVersion: order.version,
        type: 'takeaway',
        pickupCode,
      });

      if (selectedOrderId === order.id) {
        setSelectedOrder(updatedOrder);
      }
      const ticketStr = updatedOrder.ticketNo
        ? `#${String(updatedOrder.ticketNo).padStart(3, '0')}`
        : `#${updatedOrder.id.slice(0, 6)}`;
      showToast('success', `Đơn ${ticketStr} đã hoàn tất giao món.`);
      setTakeawayVerifyingOrder(null);
      await loadOrders(false);
    },
    [selectedOrderId, loadOrders, showToast]
  );

  // Đóng Mobile Sheet có animation
  const handleCloseMobileSheet = useCallback(() => {
    setIsSheetClosing(true);
    setTimeout(() => {
      setIsMobileSheetOpen(false);
      setIsSheetClosing(false);
    }, 180);
  }, []);

  return (
    <div className={`flex flex-col h-full space-y-4 ${className}`}>
      {/* 1. Header Đơn Hàng & Counts */}
      <QueueHeader
        counts={counts}
        lastUpdated={lastUpdated}
        isLoading={isRefreshing}
        onRefresh={() => loadOrders(true)}
      />

      {/* 2. Thông báo Toast nổi nếu có */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-sm animate-dialog-card-in ${
            toast.type === 'success'
              ? 'bg-[#E8F4F0] text-[#165B4B] border border-[#C6E7DC]'
              : toast.type === 'error'
                ? 'bg-[#FEF3F2] text-[#D92D20] border border-[#FECDCA]'
                : 'bg-[#F0F9FF] text-[#026AA2] border border-[#B9E6FE]'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#165B4B]" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[#D92D20]" />
            ) : (
              <Info className="w-4 h-4 flex-shrink-0 text-[#026AA2]" />
            )}
            <span>{toast.message}</span>
          </div>

          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Bố cục 2 cột Desktop (70/30) / 1 cột Mobile */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden">
        {/* ===================================================================
            CỘT TRÁI (~68% trên Desktop): Danh sách hàng đợi & nút FIFO
           =================================================================== */}
        <section className="flex-1 lg:w-[68%] flex flex-col min-h-0 space-y-3.5">
          {/* Bộ lọc Hàng đợi / Lịch sử / Loại đơn / Trạng thái */}
          <OrderFilters
            view={view}
            onViewChange={handleViewChange}
            typeFilter={typeFilter}
            onTypeChange={handleTypeChange}
            statusFilter={statusFilter}
            onStatusChange={handleStatusChange}
            totalOrders={orders.length}
            exceptionCount={counts.paymentException}
            isLoading={isLoading}
          />

          {/* Nút Nhận đơn tiếp theo FIFO duy nhất */}
          {view === 'queue' && (
            <ClaimNextButton
              hasAcceptedOrders={counts.accepted > 0}
              isClaiming={isClaiming}
              onClaimNext={handleClaimNext}
            />
          )}

          {/* Danh sách đơn cuộn mượt mà */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[300px]">
            {/* Banner cảnh báo mạng/quá tải không che nút Claim Next FIFO (P6-G02) */}
            {errorMessage && orders.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-xl bg-[#FEF6EE] border border-[#F9DBAF] text-xs text-[#8A4D00] flex items-center justify-between gap-2 shadow-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#B54708] shrink-0" />
                  <span className="truncate">{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => loadOrders(true)}
                  className="text-[11px] font-bold text-[#B54708] underline shrink-0 hover:text-[#93370D]"
                >
                  Thử lại
                </button>
              </div>
            )}

            {isLoading ? (
              <OrdersQueueSkeleton />
            ) : errorMessage && orders.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#E9ECEA] space-y-3">
                <AlertTriangle className="w-10 h-10 text-[#D92D20] mx-auto" />
                <p className="text-sm font-bold text-[#1D2522]">Không tải được đơn hàng</p>
                <p className="text-xs text-[#727B77]">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => loadOrders(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1D725E] text-white hover:bg-[#165B4B]"
                >
                  Thử lại
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center bg-[#FAFBFB] rounded-2xl border border-[#E9ECEA] space-y-2">
                <Inbox className="w-10 h-10 text-[#A0A8A5] mx-auto" />
                <p className="text-sm font-bold text-[#1D2522]">Chưa có đơn hàng nào</p>
                <p className="text-xs text-[#727B77]">
                  {view === 'queue'
                    ? 'Không có đơn nào cần xử lý trong bộ lọc hiện tại.'
                    : view === 'exceptions'
                      ? 'Không có đơn hàng nào cần đối soát hoặc đang chờ thanh toán.'
                      : 'Chưa có lịch sử đơn hàng hoàn tất hoặc hủy.'}
                </p>
              </div>
            ) : (
              <>
                {orders.map((order) => (
                  <OrderQueueCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderId === order.id}
                    onSelect={() => handleSelectOrder(order.id)}
                  />
                ))}

                {/* Keyset Pagination Load More (F05) */}
                {nextCursor && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      disabled={isLoadingMore}
                      onClick={handleLoadMore}
                      className="w-full py-2.5 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D725E] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang tải thêm đơn...</span>
                        </>
                      ) : (
                        <span>Tải thêm đơn cũ hơn</span>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ===================================================================
            CỘT PHẢI (~32% trên Desktop): Chi tiết phiếu đơn & Action
           =================================================================== */}
        <aside className="hidden lg:flex lg:w-[32%] flex-col min-h-0">
          {isLoading ? (
            <OrderDetailSkeleton />
          ) : (
            <OrderDetailPanel
              order={selectedOrder}
              isLoadingDetail={isLoadingDetail}
              isActionPending={isActionPending}
              pendingActionType={pendingActionType}
              onMarkReady={handleMarkReady}
              onComplete={handleComplete}
              onVerifyTakeawayPickup={handleVerifyTakeawayPickup}
            />
          )}
        </aside>
      </div>

      {/* =====================================================================
          MOBILE SHEET CHI TIẾT (< 1024px): Slide-up Sheet có animation
         ===================================================================== */}
      {isMobileSheetOpen && selectedOrder && (
        <div
          className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs lg:hidden ${
            isSheetClosing ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
          }`}
          role="dialog"
          aria-modal="true"
          onClick={handleCloseMobileSheet}
        >
          <div
            className={`bg-white w-full sm:max-w-lg rounded-t-[28px] sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[#E9ECEA] ${
              isSheetClosing ? 'animate-sheet-slide-down' : 'animate-sheet-slide-up'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Sheet mobile */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E9ECEA] bg-[#FAFBFB]">
              <span className="text-xs font-bold text-[#727B77] uppercase tracking-wider">
                Chi tiết phiếu đơn
              </span>
              <button
                type="button"
                onClick={handleCloseMobileSheet}
                className="w-8 h-8 rounded-full bg-[#F1F3F2] hover:bg-[#E9ECEA] flex items-center justify-center text-[#55605C] transition-colors"
                aria-label="Đóng chi tiết"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nội dung panel chi tiết */}
            <div className="flex-1 overflow-hidden">
              <OrderDetailPanel
                order={selectedOrder}
                isLoadingDetail={isLoadingDetail}
                isActionPending={isActionPending}
                pendingActionType={pendingActionType}
                onMarkReady={handleMarkReady}
                onComplete={handleComplete}
                onVerifyTakeawayPickup={handleVerifyTakeawayPickup}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DIALOG XÁC MINH MÃ NHẬN MÓN MANG ĐI (P4-G03)
         ===================================================================== */}
      <TakeawayPickupVerificationDialog
        order={takeawayVerifyingOrder}
        isOpen={!!takeawayVerifyingOrder}
        onClose={() => setTakeawayVerifyingOrder(null)}
        onConfirmPickup={handleConfirmTakeawayPickup}
        onRefreshOrders={() => loadOrders(false)}
      />
    </div>
  );
};
