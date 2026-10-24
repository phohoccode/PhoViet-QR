import React, { useState, useRef } from 'react';
import {
  Plus,
  RefreshCw,
  QrCode,
  Edit2,
  KeyRound,
  Loader2,
  Power,
  Search,
  MoreVertical,
} from 'lucide-react';
import type {
  OwnerSessionOpenedView,
} from '../../../../docs/contracts/types';
import type { OwnerTable, OwnerQrCode } from '@/types/contracts/table-qr';
import {
  openOwnerTableSession,
  updateOwnerTable,
  MenuApiError,
} from '@/features/owner/api-client';
import { AddEditTableDialog } from './AddEditTableDialog';
import { TableQrModal } from './TableQrModal';
import { TableSessionOpenedDialog, TableDetailDialog } from '../TableSessionDialog';
import { OwnerErrorState } from '../OwnerErrorState';
import { OwnerEmptyState } from '../OwnerEmptyState';
import { TablesGridSkeleton } from '../OwnerTabSkeletons';

export interface TableManagementViewProps {
  tables: OwnerTable[];
  qrCodes: OwnerQrCode[];
  storeName?: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRefresh?: () => void;
  onTableCreated?: (table: OwnerTable, createdQrPath?: string | null) => void;
  onTableUpdated?: (table: OwnerTable) => void;
  // P2-HF01 PIN lifecycle props
  onRevealTablePin?: (tableId: string) => Promise<{ pin: string; isLegacy?: boolean }>;
  onRotateTablePin?: (tableId: string) => Promise<{ pin: string }>;
  onMigrateLegacyTablePin?: (tableId: string) => Promise<{ pin: string }>;
}

/**
 * TableManagementView — Trình quản lý toàn diện cho Tab Bàn trong Dashboard Chủ quán.
 * - Danh sách bàn dạng lưới chuẩn Minimal Emerald POS (1 cột mobile, 2-3 cột tablet, 4-6 cột desktop).
 * - Tình trạng bàn: Đang trống / Có khách / Đang thanh toán / Ngưng sử dụng.
 * - Tình trạng QR: Đã có QR / Chưa có QR / QR bị khóa.
 * - CTA Thêm bàn, Sửa nhãn, Xem QR, In QR, Mở phiên bàn (R12), Bật/Tắt bàn.
 */
export const TableManagementView: React.FC<TableManagementViewProps> = ({
  tables,
  qrCodes,
  storeName = 'PHỞ VIỆT QR',
  isLoading = false,
  errorMessage = null,
  onRefresh,
  onTableCreated,
  onTableUpdated,
  onRevealTablePin,
  onRotateTablePin,
  onMigrateLegacyTablePin,
}) => {
  // Bộ lọc & tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'empty' | 'occupied' | 'inactive'>('all');

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [tableToEdit, setTableToEdit] = useState<OwnerTable | null>(null);
  const [selectedTableForQr, setSelectedTableForQr] = useState<OwnerTable | null>(null);
  const [selectedTableForDetail, setSelectedTableForDetail] = useState<OwnerTable | null>(null);

  // Mở phiên bàn (R12)
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);
  const [openedSessionView, setOpenedSessionView] = useState<OwnerSessionOpenedView | null>(null);
  const [openSessionError, setOpenSessionError] = useState<{ tableId: string; message: string } | null>(null);

  // Action Menu dropdown cho từng bàn
  const [openMenuTableId, setOpenMenuTableId] = useState<string | null>(null);

  // Bật/tắt bàn
  const [togglingTableId, setTogglingTableId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Idempotent Request IDs qua các lần retry (UI-02)
  const pendingOpenSessionRequestIdsRef = useRef<Record<string, string>>({});
  const pendingToggleRequestIdsRef = useRef<Record<string, string>>({});

  // Lọc bàn
  const filteredTables = tables.filter((t) => {
    const matchesSearch = t.label.toLowerCase().includes(searchQuery.toLowerCase().trim());
    if (!matchesSearch) return false;

    if (filterMode === 'all') return true;
    if (filterMode === 'empty') return t.active && t.session === null;
    if (filterMode === 'occupied') return t.active && t.session !== null;
    if (filterMode === 'inactive') return !t.active;
    return true;
  });

  // Gọi R12 POST /api/owner/tables/:id/sessions để mở phiên bàn mới bằng typed client
  const handleOpenTableSession = async (table: OwnerTable) => {
    setOpeningTableId(table.id);
    setOpenSessionError(null);
    setActionError(null);

    // Giữ nguyên command requestId qua retry / timeout (UI-02)
    if (!pendingOpenSessionRequestIdsRef.current[table.id]) {
      pendingOpenSessionRequestIdsRef.current[table.id] = crypto.randomUUID();
    }
    const requestId = pendingOpenSessionRequestIdsRef.current[table.id];

    try {
      const opened = await openOwnerTableSession(table.id, { requestId });

      // Thành công -> xóa requestId chờ
      delete pendingOpenSessionRequestIdsRef.current[table.id];

      // Cập nhật lại table state
      onTableUpdated?.({
        ...table,
        session: opened.session,
      });

      setOpenedSessionView(opened);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        if (err.status === 409) {
          delete pendingOpenSessionRequestIdsRef.current[table.id];
          setOpenSessionError({
            tableId: table.id,
            message: 'Bàn đã có phiên đang mở hoặc xung đột yêu cầu.',
          });
          onRefresh?.();
          return;
        }
        setOpenSessionError({
          tableId: table.id,
          message: err.error.message || 'Không thể mở phiên bàn.',
        });
      } else {
        // Giữ lại requestId khi lỗi mạng để thử lại an toàn (UI-02)
        setOpenSessionError({
          tableId: table.id,
          message: 'Lỗi mạng khi mở phiên bàn. Vui lòng bấm thử lại.',
        });
      }
    } finally {
      setOpeningTableId(null);
    }
  };

  // Bật / tắt bàn (PATCH /api/owner/tables/:id với expectedUpdatedAt nguyên bản từ DB)
  const handleToggleTableActive = async (table: OwnerTable) => {
    if (table.session !== null) {
      setActionError(
        `Không thể ngưng sử dụng ${table.label} khi bàn đang có phiên hoạt động hoặc chờ thanh toán.`
      );
      return;
    }

    setTogglingTableId(table.id);
    setActionError(null);

    // Giữ nguyên command requestId qua retry / timeout (UI-02)
    if (!pendingToggleRequestIdsRef.current[table.id]) {
      pendingToggleRequestIdsRef.current[table.id] = crypto.randomUUID();
    }
    const requestId = pendingToggleRequestIdsRef.current[table.id];
    const nextActive = !table.active;

    try {
      const updatedTable = await updateOwnerTable(table.id, {
        active: nextActive,
        expectedUpdatedAt: table.updatedAt,
        requestId,
      });

      // Thành công -> xóa requestId chờ
      delete pendingToggleRequestIdsRef.current[table.id];
      onTableUpdated?.(updatedTable);
    } catch (err: unknown) {
      if (err instanceof MenuApiError) {
        delete pendingToggleRequestIdsRef.current[table.id];
        const field = err.error.details?.field;
        const code = err.error.code;

        if (code === 'INVALID_STATE_TRANSITION' && field === 'activeSession') {
          setActionError('Không thể thay đổi trạng thái khi bàn đang có phiên mở hoặc chờ thanh toán.');
        } else if (code === 'INVALID_STATE_TRANSITION' && field === 'expectedUpdatedAt') {
          setActionError('Dữ liệu bàn đã bị thay đổi bởi phiên khác. Đang làm mới...');
          onRefresh?.();
        } else {
          setActionError(err.error.message || 'Không thể thay đổi trạng thái bàn.');
        }
      } else {
        // Giữ lại requestId khi lỗi mạng để thử lại an toàn (UI-02)
        setActionError('Lỗi mạng khi thay đổi trạng thái bàn. Vui lòng thử lại.');
      }
    } finally {
      setTogglingTableId(null);
      setOpenMenuTableId(null);
    }
  };

  const occupiedCount = tables.filter((t) => t.session !== null).length;
  const emptyCount = tables.filter((t) => t.active && t.session === null).length;

  return (
    <div className="flex-1 flex flex-col gap-4">
      {/* 1. Header chính: Tiêu đề + Thống kê + CTA Thêm bàn */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#E9ECEA]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-[#1D2522]">Quản lý bàn</h3>
            <span className="text-xs font-bold px-2.5 py-0.5 bg-[#E8F4F0] text-[#1D725E] rounded-full">
              {tables.length} bàn
            </span>
          </div>
          <p className="text-xs text-[#727B77] mt-0.5">
            Quản lý nhãn bàn, xem và tải mã QR công khai, mở phiên phục vụ khách.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-10 px-3 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#35977D] ${isLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="flex-1 sm:flex-none h-10 px-4 rounded-xl bg-[#1D725E] hover:bg-[#165B4B] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Thêm bàn</span>
          </button>
        </div>
      </div>

      {/* Thông báo lỗi thao tác chung */}
      {actionError && (
        <div
          role="alert"
          className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#912018] flex items-center justify-between gap-2 animate-in fade-in"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[#912018] hover:underline font-semibold shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 2. Thanh công cụ tìm kiếm và lọc trạng thái bàn */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Tìm kiếm */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#A0A8A5] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên bàn..."
            className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-[#E9ECEA] bg-[#F7F8F7] text-xs text-[#1D2522] placeholder:text-[#A0A8A5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#35977D] transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterMode === 'all'
                ? 'bg-[#1D725E] text-white'
                : 'bg-white border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]'
            }`}
          >
            Tất cả ({tables.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('occupied')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterMode === 'occupied'
                ? 'bg-[#1D725E] text-white'
                : 'bg-white border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]'
            }`}
          >
            Có khách ({occupiedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('empty')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterMode === 'empty'
                ? 'bg-[#1D725E] text-white'
                : 'bg-white border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]'
            }`}
          >
            Đang trống ({emptyCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('inactive')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterMode === 'inactive'
                ? 'bg-[#1D725E] text-white'
                : 'bg-white border border-[#E9ECEA] text-[#55605C] hover:bg-[#F7F8F7]'
            }`}
          >
            Ngưng dùng ({tables.filter((t) => !t.active).length})
          </button>
        </div>
      </div>

      {/* Thông báo lỗi mở phiên bàn */}
      {openSessionError && (
        <div
          role="alert"
          className="p-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl text-xs text-[#912018] flex items-center justify-between gap-2 animate-in fade-in"
        >
          <span>{openSessionError.message}</span>
          <button
            type="button"
            onClick={() => setOpenSessionError(null)}
            className="text-[#912018] hover:underline font-semibold shrink-0"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Lỗi nạp dữ liệu */}
      {!isLoading && errorMessage && (
        <OwnerErrorState
          title="Không thể tải sơ đồ bàn"
          description={errorMessage}
          onRetry={onRefresh}
        />
      )}

      {/* Danh sách rỗng */}
      {!isLoading && !errorMessage && tables.length === 0 && (
        <OwnerEmptyState
          title="Chưa có bàn nào trong quán"
          description="Hãy tạo bàn phục vụ đầu tiên để bắt đầu in mã QR và đón khách."
        />
      )}

      {/* Không tìm thấy kết quả theo bộ lọc */}
      {!isLoading && !errorMessage && tables.length > 0 && filteredTables.length === 0 && (
        <div className="p-8 text-center bg-[#F7F8F7] rounded-2xl border border-dashed border-[#E9ECEA] space-y-2">
          <p className="text-xs font-semibold text-[#1D2522]">Không có bàn nào phù hợp</p>
          <p className="text-xs text-[#727B77]">Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn bộ lọc.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterMode('all');
            }}
            className="mt-2 h-8 px-3 rounded-lg bg-white border border-[#E9ECEA] text-xs font-semibold text-[#1D2522] hover:bg-[#F7F8F7]"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      {/* 3. Lưới các bàn phục vụ hoặc Skeleton */}
      {isLoading ? (
        <TablesGridSkeleton />
      ) : !errorMessage && filteredTables.length > 0 ? (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-1">
          {filteredTables.map((t) => {
            const isOccupied = t.session !== null;
            const isCheckoutPending = t.session?.status === 'checkout_pending';
            const isInactive = !t.active;
            const matchedQr =
              qrCodes.find((q) => q.type === 'table' && q.table?.id === t.id && q.active !== false) ??
              t.qr ??
              null;
            const isOpening = openingTableId === t.id;
            const isToggling = togglingTableId === t.id;
            const isMenuOpen = openMenuTableId === t.id;

            return (
              <div
                key={t.id}
                className={`relative p-3.5 rounded-2xl border flex flex-col justify-between text-left transition-all ${
                  isInactive
                    ? 'bg-[#F7F8F7]/70 border-[#E9ECEA] opacity-75'
                    : isOccupied
                    ? isCheckoutPending
                      ? 'bg-[#FEF6EE]/60 border-[#F9DBAF] shadow-xs'
                      : 'bg-[#E8F4F0]/60 border-[#35977D] shadow-xs'
                    : 'bg-white border-[#E9ECEA] hover:border-[#C6E7DC]'
                }`}
              >
                {/* Phần trên: Tên bàn + Status Badges + Action Dropdown */}
                <div>
                  <div className="flex items-start justify-between gap-1.5 mb-2">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-[#1D2522] truncate block">
                        {t.label}
                      </span>
                    </div>

                    {/* Menu thao tác phụ của card */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpenMenuTableId(isMenuOpen ? null : t.id)}
                        className="w-7 h-7 rounded-lg hover:bg-[#F1F3F2] text-[#727B77] hover:text-[#1D2522] flex items-center justify-center transition-colors"
                        aria-label={`Tùy chọn cho ${t.label}`}
                      >
                        <MoreVertical className="w-4 h-4" aria-hidden="true" />
                      </button>

                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-8 z-20 w-44 bg-white rounded-xl border border-[#E9ECEA] shadow-lg py-1 animate-in fade-in zoom-in-95 duration-150 text-xs"
                          role="menu"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null);
                              setTableToEdit(t);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-[#F7F8F7] text-[#1D2522] flex items-center gap-2"
                            role="menuitem"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#727B77]" aria-hidden="true" />
                            <span>Đổi tên bàn</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null);
                              setSelectedTableForQr(t);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-[#F7F8F7] text-[#1D2522] flex items-center gap-2"
                            role="menuitem"
                          >
                            <QrCode className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
                            <span>Mã QR bàn</span>
                          </button>

                          <div className="my-1 border-t border-[#E9ECEA]" />

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuTableId(null);
                              handleToggleTableActive(t);
                            }}
                            disabled={isToggling || isOccupied}
                            className={`w-full px-3 py-2 text-left flex items-center gap-2 ${
                              isOccupied
                                ? 'text-[#A0A8A5] cursor-not-allowed'
                                : t.active
                                ? 'text-[#B42318] hover:bg-[#FEF3F2]'
                                : 'text-[#1D725E] hover:bg-[#E8F4F0]'
                            }`}
                            role="menuitem"
                          >
                            <Power className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {isToggling
                                ? 'Đang xử lý...'
                                : t.active
                                ? 'Ngưng dùng bàn'
                                : 'Bật dùng lại'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Badges trạng thái bàn */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {isInactive ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F3F2] text-[#727B77]">
                        Ngưng dùng
                      </span>
                    ) : isOccupied ? (
                      isCheckoutPending ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FEE4E2] text-[#B42318]">
                          Chờ thanh toán
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E8F4F0] text-[#1D725E]">
                          Có khách ({t.session?.orderCount ?? 0} món)
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F7F8F7] text-[#727B77] border border-[#E9ECEA]">
                        Bàn trống
                      </span>
                    )}

                    {/* QR badge */}
                    {matchedQr ? (
                      <span className="text-[10px] font-medium text-[#727B77] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#35977D]" />
                        <span>QR active</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-[#B42318] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FDA29B]" />
                        <span>Chưa có QR</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Phần dưới: Nút CTA hành động nhanh */}
                <div className="pt-2 border-t border-[#E9ECEA]/60 space-y-2">
                  {/* Nếu bàn có khách: Hiển thị tổng tiền tạm tính */}
                  {isOccupied && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#727B77]">Tạm tính:</span>
                      <span className="font-bold text-[#1D2522]">
                        {(t.session?.totalVnd ?? 0).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Nút Xem QR */}
                    <button
                      type="button"
                      onClick={() => setSelectedTableForQr(t)}
                      className="h-8 px-2 rounded-xl border border-[#E9ECEA] bg-white hover:bg-[#F7F8F7] text-xs font-semibold text-[#1D2522] flex items-center justify-center gap-1 transition-colors"
                      title="Xem mã QR dán bàn"
                    >
                      <QrCode className="w-3.5 h-3.5 text-[#35977D]" aria-hidden="true" />
                      <span>Xem QR</span>
                    </button>

                    {/* Nút Mở phiên hoặc Xem chi tiết bàn */}
                    {isOccupied ? (
                      <button
                        type="button"
                        onClick={() => setSelectedTableForDetail(t)}
                        className="h-8 px-2 rounded-xl bg-[#E8F4F0] hover:bg-[#D3EDE4] text-xs font-bold text-[#1D725E] flex items-center justify-center gap-1 transition-colors"
                      >
                        <span>Chi tiết</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenTableSession(t)}
                        disabled={isOpening || isInactive}
                        className={`h-8 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                          isInactive
                            ? 'bg-[#E9ECEA] text-[#A0A8A5] cursor-not-allowed'
                            : isOpening
                            ? 'bg-[#1D725E]/70 text-white cursor-wait'
                            : 'bg-[#1D725E] hover:bg-[#165B4B] text-white shadow-2xs'
                        }`}
                        title="Mở phiên bàn mới và nhận mã phiên 6 số"
                      >
                        {isOpening ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <>
                            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Mở phiên</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* =====================================================================
          HỘP THOẠI MODAL (Add / Edit / QR / Session Detail)
         ===================================================================== */}
      {/* Modal Thêm bàn */}
      <AddEditTableDialog
        isOpen={isAddOpen}
        mode="create"
        onClose={() => setIsAddOpen(false)}
        onSuccess={(created, qrPath) => {
          onTableCreated?.(created, qrPath);
        }}
        onViewQr={(tbl) => setSelectedTableForQr(tbl)}
      />

      {/* Modal Sửa nhãn bàn */}
      {tableToEdit && (
        <AddEditTableDialog
          isOpen={Boolean(tableToEdit)}
          mode="edit"
          tableToEdit={tableToEdit}
          onClose={() => setTableToEdit(null)}
          onSuccess={(updated) => {
            onTableUpdated?.(updated);
          }}
        />
      )}

      {/* Modal Xem / Tải / In mã QR của bàn */}
      {selectedTableForQr && (
        <TableQrModal
          table={selectedTableForQr}
          qrCode={
            qrCodes.find(
              (q) => q.type === 'table' && q.table?.id === selectedTableForQr.id && q.active !== false
            ) ?? selectedTableForQr.qr
          }
          storeName={storeName}
          isOpen={Boolean(selectedTableForQr)}
          onClose={() => setSelectedTableForQr(null)}
          onQrRotated={(newQr) => {
            onTableUpdated?.({
              ...selectedTableForQr,
              qr: newQr,
            });
            onRefresh?.();
          }}
        />
      )}

      {/* Modal Mở phiên bàn thành công (R12 Private Result) */}
      {openedSessionView && (
        <TableSessionOpenedDialog
          openedView={openedSessionView}
          qrCode={
            qrCodes.find(
              (q) => q.type === 'table' && q.table?.id === openedSessionView.table.id
            ) ?? null
          }
          onClose={() => setOpenedSessionView(null)}
        />
      )}

      {/* Modal Chi tiết phiên bàn (Xem bill, trạng thái thanh toán & PIN) */}
      {selectedTableForDetail && (
        <TableDetailDialog
          table={selectedTableForDetail}
          qrCode={
            qrCodes.find(
              (q) => q.type === 'table' && q.table?.id === selectedTableForDetail.id
            ) ?? selectedTableForDetail.qr
          }
          onClose={() => setSelectedTableForDetail(null)}
          onSessionUpdated={(tableId, pinView) => {
            const targetTable = tables.find((t) => t.id === tableId);
            if (targetTable && targetTable.session) {
              onTableUpdated?.({
                ...targetTable,
                session: {
                  ...targetTable.session,
                  version: pinView.sessionVersion,
                  pinState: 'active',
                },
              });
            }
            onRefresh?.();
          }}
          onRefresh={onRefresh}
          onRevealPin={onRevealTablePin}
          onRotatePin={onRotateTablePin}
          onMigrateLegacyPin={onMigrateLegacyTablePin}
        />
      )}
    </div>
  );
};
