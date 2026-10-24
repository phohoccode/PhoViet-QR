'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  LogIn,
  CheckCircle2,
  Clock,
  Sparkles,
  Utensils,
  Receipt,
  Smartphone,
} from 'lucide-react';

export const HomeHero: React.FC = () => {
  return (
    <section className="relative overflow-hidden pt-8 pb-14 sm:pt-12 sm:pb-20 lg:pt-16 lg:pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Cột nội dung bên trái */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* Tag nhỏ giới thiệu giải pháp */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F4F0] border border-[#C6E7DC] text-[#165B4B] text-xs font-semibold mb-5 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Gọi món trực tiếp tại quán · Không cần tải ứng dụng</span>
            </div>

            {/* Tiêu đề H1 chính — rõ ràng, dễ hiểu */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#1D2522] tracking-tight leading-[1.18] sm:leading-[1.15]">
              Quét mã QR tại quán, <br className="hidden sm:inline" />
              <span className="text-[#1D725E]">gọi món ngay trên điện thoại.</span>
            </h1>

            {/* Mô tả giải pháp bằng ngôn ngữ đời thường */}
            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-[#55605C] max-w-xl leading-relaxed">
              Bạn chỉ cần dùng điện thoại quét mã QR có sẵn tại bàn hoặc quầy để tự xem thực đơn, chọn món và theo dõi khi nào món nấu xong. Không cần gọi nhân viên ghi giấy, không phải xếp hàng chờ đợi.
            </p>

            {/* Dòng lợi ích thiết thực cho người dùng */}
            <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-3 text-xs sm:text-sm font-medium text-[#727B77]">
              <span className="inline-flex items-center gap-1.5 text-[#1D2522]">
                <CheckCircle2 className="w-4 h-4 text-[#35977D]" aria-hidden="true" />
                Không cần tạo tài khoản
              </span>
              <span className="text-[#C6CECB] font-light">·</span>
              <span className="inline-flex items-center gap-1.5 text-[#1D2522]">
                <CheckCircle2 className="w-4 h-4 text-[#35977D]" aria-hidden="true" />
                Xem ảnh món &amp; giá rõ ràng
              </span>
              <span className="text-[#C6CECB] font-light">·</span>
              <span className="inline-flex items-center gap-1.5 text-[#1D2522]">
                <CheckCircle2 className="w-4 h-4 text-[#35977D]" aria-hidden="true" />
                Biết khi nào món nấu xong
              </span>
            </div>

            {/* Nhóm nút hành động */}
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <a
                href="#ordering-options"
                className="h-12 px-6 rounded-xl text-sm font-bold bg-[#1D725E] hover:bg-[#165B4B] active:scale-[0.98] text-white transition-all shadow-xs flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
              >
                <span>Xem cách gọi món</span>
                <ArrowDown className="w-4 h-4" aria-hidden="true" />
              </a>

              <Link
                href="/login"
                className="h-12 px-5 rounded-xl text-sm font-semibold bg-[#FFFFFF] hover:bg-[#F5F6F5] active:scale-[0.98] text-[#1D2522] border border-[#E9ECEA] transition-all shadow-xs flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D725E]"
              >
                <LogIn className="w-4 h-4 text-[#727B77]" aria-hidden="true" />
                <span>Dành cho chủ quán</span>
              </Link>
            </div>
          </div>

          {/* Cột minh họa bên phải — Màn hình xem trên điện thoại */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end w-full">
            <div className="w-full max-w-[380px] sm:max-w-[420px] bg-[#FFFFFF] rounded-3xl border border-[#E9ECEA] p-5 sm:p-6 shadow-shell relative">
              {/* Header thẻ minh họa */}
              <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#E9ECEA]">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#1D725E]" />
                  <span className="text-[12px] font-bold text-[#1D725E] tracking-tight">
                    Màn hình gọi món trên điện thoại
                  </span>
                </div>
                <span className="text-[11px] text-[#727B77] bg-[#F5F6F5] px-2 py-0.5 rounded-md font-medium">
                  Ví dụ minh họa
                </span>
              </div>

              {/* Thông tin đơn mẫu */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Utensils className="w-4 h-4 text-[#1D725E]" aria-hidden="true" />
                    <span className="text-xs font-bold text-[#1D2522]">Khách ngồi tại Bàn 04</span>
                  </div>
                  <p className="text-[11px] text-[#727B77] mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Vừa gửi đơn 2 phút trước</span>
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#EBF3FB] text-[#1D528A] border border-[#D0E2F7]">
                  Bếp đang nấu
                </span>
              </div>

              {/* Danh sách món mẫu */}
              <div className="mt-4 space-y-2.5">
                <div className="p-3 rounded-xl bg-[#FAFBFB] border border-[#F0F2F1] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-[#E8F4F0] text-[#1D725E] font-bold flex items-center justify-center text-[11px]">
                      1×
                    </span>
                    <div>
                      <p className="font-semibold text-[#1D2522]">Phở Bò Tái Nạm</p>
                      <p className="text-[10px] text-[#727B77]">Nhiều hành trần, ít bánh</p>
                    </div>
                  </div>
                  <span className="font-bold text-[#1D2522]">65.000đ</span>
                </div>

                <div className="p-3 rounded-xl bg-[#FAFBFB] border border-[#F0F2F1] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-[#E8F4F0] text-[#1D725E] font-bold flex items-center justify-center text-[11px]">
                      1×
                    </span>
                    <div>
                      <p className="font-semibold text-[#1D2522]">Trà Sen Vàng</p>
                      <p className="text-[10px] text-[#727B77]">50% đường, đá riêng</p>
                    </div>
                  </div>
                  <span className="font-bold text-[#1D2522]">35.000đ</span>
                </div>
              </div>

              {/* Tiến độ nấu món rõ ràng */}
              <div className="mt-4 pt-3.5 border-t border-[#F0F2F1]">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#55605C] mb-2">
                  <span>Tiến độ nấu món</span>
                  <span className="text-[#1D725E]">Đang nấu món</span>
                </div>
                <div className="w-full h-1.5 bg-[#E9ECEA] rounded-full overflow-hidden">
                  <div className="w-2/3 h-full bg-[#1D725E] rounded-full" />
                </div>
                <div className="flex justify-between text-[10px] text-[#727B77] mt-1.5">
                  <span className="text-[#1D725E] font-semibold">Đã nhận đơn</span>
                  <span className="text-[#1D725E] font-semibold">Bếp đang nấu</span>
                  <span>Sẵn sàng phục vụ</span>
                </div>
              </div>

              {/* Tóm tắt thanh toán */}
              <div className="mt-4 pt-3 border-t border-[#E9ECEA] flex items-center justify-between text-xs">
                <span className="text-[#727B77] flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5 text-[#35977D]" />
                  Tổng thanh toán
                </span>
                <span className="font-bold text-sm text-[#1D2522]">100.000đ</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
