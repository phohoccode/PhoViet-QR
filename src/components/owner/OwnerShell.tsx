"use client";

import React, { useState, useEffect, useCallback } from "react";
import type {
  OrderDetail,
  TableSummary,
  MenuItem,
} from "../../../docs/contracts/types";
import type { OwnerTable, OwnerQrCode } from "@/types/contracts/table-qr";
import { OwnerHeader } from "./OwnerHeader";
import { type OwnerTabType } from "./OwnerHeaderPills";
import { OwnerMenuView } from "./menu/OwnerMenuView";
import { TableManagementView } from "./tables/TableManagementView";
import { TakeawayQrCard } from "./settings/TakeawayQrCard";
import { VietQrPaymentSettingsCard } from "./settings/VietQrPaymentSettingsCard";
import { StoreAdmissionControlCard } from "./settings/StoreAdmissionControlCard";
import { OwnerOrdersView } from "./orders/OwnerOrdersView";

export type OwnerTabState = "ready" | "loading" | "empty" | "error";

export interface OwnerShellProps {
  storeName: string;
  acceptingOrders?: boolean;
  orders: OrderDetail[];
  tables?: (OwnerTable | TableSummary)[];
  menuItems?: MenuItem[];
  initialTab?: OwnerTabType;
  ownerName?: string;
  roleLabel?: string;
  isLoggingOut?: boolean;
  logoutError?: string | null;
  ordersState?: OwnerTabState;
  tablesState?: OwnerTabState;
  menuState?: OwnerTabState;
  onRetryOrders?: () => void;
  onRetryTables?: () => void;
  onRetryMenu?: () => void;
  onClaimNext?: () => void;
  onLogout?: () => void;
  logoutAction?: () => void | Promise<void>;
  className?: string;
}

function toOwnerTables(items: (TableSummary | OwnerTable)[]): OwnerTable[] {
  return items.map((t) => ({
    ...t,
    updatedAt:
      (t as OwnerTable).updatedAt || "1970-01-01T00:00:00.000000+00:00",
    qr: (t as OwnerTable).qr ?? null,
  }));
}

/**
 * OwnerShell — Khung giao diện toàn diện cho Dashboard Chủ quán (Desktop & Responsive).
 * Phong cách: Minimal Emerald POS (khớp assets/ui-reference.png)
 * - Vỏ trang xám nhạt #F5F6F5
 * - Khung nổi nền trắng bo góc lớn 24px-28px (rounded-[24px] md:rounded-[28px])
 * - Phân chia 70/30 trên desktop, tự co về 1 cột trên tablet/mobile
 * - Chi tiết đơn hàng trên mobile hiển thị dạng Sheet/Dialog
 * - Đầy đủ 4 Tab: Đơn hàng, Bàn, Menu, Cài đặt với các trạng thái loading/empty/error.
 */
export const OwnerShell: React.FC<OwnerShellProps> = ({
  storeName,
  acceptingOrders = true,
  orders,
  tables = [],
  initialTab = "orders",
  ownerName,
  roleLabel,
  isLoggingOut = false,
  logoutError = null,
  tablesState = "ready",
  onRetryTables,
  onLogout,
  logoutAction,
  className = "",
}) => {
  const [activeTab, setActiveTab] = useState<OwnerTabType>(initialTab);

  // =========================================================================
  // KẾT NỐI API THỰC TẾ CHO TAB BÀN (R11 GET /api/owner/tables & R17 GET /api/owner/qr-codes)
  // =========================================================================
  const [tablesList, setTablesList] = useState<OwnerTable[]>(
    toOwnerTables(tables),
  );
  const [qrCodesList, setQrCodesList] = useState<OwnerQrCode[]>([]);
  const [currentTablesState, setCurrentTablesState] = useState<OwnerTabState>(
    tables.length > 0 ? tablesState : "loading",
  );
  const [tablesErrorMessage, setTablesErrorMessage] = useState<string | null>(
    null,
  );
  const [isFetchingTables, setIsFetchingTables] = useState<boolean>(false);

  // Nạp danh sách bàn từ R11 và danh sách QR từ R17 (Dùng khi user bấm "Làm mới" hoặc "Thử lại")
  const fetchTablesAndQRs = useCallback(async () => {
    setIsFetchingTables(true);
    setTablesErrorMessage(null);
    onRetryTables?.();

    try {
      const [tablesRes, qrRes] = await Promise.all([
        fetch("/api/owner/tables", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/owner/qr-codes", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
      ]);

      let hasTablesData = false;

      if (tablesRes.ok) {
        const tablesJson = await tablesRes.json();
        if (tablesJson?.data?.tables) {
          setTablesList(tablesJson.data.tables);
          hasTablesData = true;
        }
      }

      if (qrRes.ok) {
        const qrJson = await qrRes.json();
        if (qrJson?.data) {
          setQrCodesList(qrJson.data);
        }
      }

      if (hasTablesData) {
        setCurrentTablesState("ready");
        setIsFetchingTables(false);
        return;
      }

      // Xử lý lỗi từ server
      let errMessage = "Không thể tải sơ đồ bàn từ máy chủ.";
      try {
        const errJson = await tablesRes.json();
        if (errJson?.error?.message) {
          errMessage = errJson.error.message;
        }
      } catch {
        // Non-JSON
      }

      setTablesErrorMessage(errMessage);
      setCurrentTablesState("error");
    } catch {
      setTablesErrorMessage("Lỗi mạng khi kết nối tới dịch vụ quản lý bàn.");
      setCurrentTablesState("error");
    } finally {
      setIsFetchingTables(false);
    }
  }, [onRetryTables]);

  // Tự động tải dữ liệu khi chuyển sang tab bàn hoặc cài đặt (UI-01)
  useEffect(() => {
    if (activeTab !== "tables" && activeTab !== "settings") return;

    let isCancelled = false;
    const timer = setTimeout(() => {
      if (!isCancelled) {
        void fetchTablesAndQRs();
      }
    }, 0);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, fetchTablesAndQRs]);

  return (
    <div
      className={`min-h-screen bg-[#F5F6F5] p-2 sm:p-4 md:p-6 text-[#1D2522] ${className}`}
    >
      {/* =====================================================================
          SHELL CONTAINER: Panel trắng bo tròn nổi trên nền xám nhạt
         ===================================================================== */}
      <div className="max-w-[1440px] mx-auto bg-white rounded-[20px] sm:rounded-[24px] md:rounded-[28px] border border-[#E9ECEA] shadow-shell overflow-hidden min-h-[92vh] flex flex-col">
        {/* 1. Header chuẩn ảnh tham chiếu */}
        <OwnerHeader
          storeName={storeName}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ownerName={ownerName}
          roleLabel={roleLabel}
          isLoggingOut={isLoggingOut}
          logoutError={logoutError}
          onLogout={onLogout}
          logoutAction={logoutAction}
        />

        {/* 2. Nội dung 4 Tab */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 bg-white overflow-hidden flex flex-col">
          {/* =================================================================
              TAB 1: ĐƠN HÀNG (Bố cục 70/30 Desktop, 1 cột Mobile/Tablet FIFO P3-G02)
             ================================================================= */}
          {activeTab === "orders" && (
            <OwnerOrdersView initialOrders={orders} storeName={storeName} />
          )}

          {/* =================================================================
              TAB 2: BÀN (Toàn diện: Danh sách, Thêm/Sửa, QR Preview/Tải/In, R12)
             ================================================================= */}
          {activeTab === "tables" && (
            <TableManagementView
              tables={tablesList}
              qrCodes={qrCodesList}
              storeName={storeName}
              isLoading={isFetchingTables || currentTablesState === "loading"}
              errorMessage={tablesErrorMessage}
              onRefresh={fetchTablesAndQRs}
              onTableCreated={(newTable) => {
                setTablesList((prev) => {
                  const existingIdx = prev.findIndex(
                    (t) => t.id === newTable.id,
                  );
                  if (existingIdx >= 0) {
                    const copy = [...prev];
                    copy[existingIdx] = newTable;
                    return copy;
                  }
                  return [...prev, newTable];
                });
                if (newTable.qr) {
                  setQrCodesList((prev) => [
                    ...prev.filter((q) => q.id !== newTable.qr?.id),
                    newTable.qr!,
                  ]);
                }
                fetchTablesAndQRs();
              }}
              onTableUpdated={(updatedTable) => {
                setTablesList((prev) =>
                  prev.map((t) =>
                    t.id === updatedTable.id ? updatedTable : t,
                  ),
                );
                fetchTablesAndQRs();
              }}
              onNavigateToOrders={() => setActiveTab("orders")}
            />
          )}

          {/* =================================================================
              TAB 3: MENU (Quản lý món ăn P2-G02)
             ================================================================= */}
          {activeTab === "menu" && <OwnerMenuView />}

          {/* =================================================================
              TAB 4: CÀI ĐẶT (Thiết lập quán & QR Mua mang đi tại quầy)
             ================================================================= */}
          {activeTab === "settings" && (
            <div className="flex-1 max-w-3xl mx-auto w-full py-4 space-y-4">
              {/* CARD 1: Điều khiển trạng thái tiếp nhận đơn hàng quán (P6-G02) */}
              <StoreAdmissionControlCard
                masterAccepting={acceptingOrders !== false}
                dineInAccepting={acceptingOrders !== false}
                takeawayAccepting={acceptingOrders !== false}
              />

              {/* CARD 2: QR Mua mang đi tại quầy (P2-G04, lọc chính xác mã active chưa thu hồi theo UI-01) */}
              <TakeawayQrCard
                storeName={storeName}
                initialQrCode={qrCodesList.find(
                  (q) => q.type === "takeaway" && q.active && !q.retiredAt,
                )}
                onQrUpdated={(updatedQr) => {
                  setQrCodesList((prev) => {
                    const filtered = prev.filter((q) => q.type !== "takeaway");
                    return [...filtered, updatedQr];
                  });
                  fetchTablesAndQRs();
                }}
              />

              {/* CARD 3: Cổng thanh toán VietQR (Tự động chuyển khoản qua PayOS Gateway) */}
              <VietQrPaymentSettingsCard
                onNavigateToOrders={() => setActiveTab("orders")}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
