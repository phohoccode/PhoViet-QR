'use client';

import React from 'react';
import { QrCode, ClipboardList, CheckCircle, ArrowRight } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      step: '1',
      title: 'Quét mã QR tại quán',
      description:
        'Mở máy ảnh hoặc Zalo trên điện thoại quét mã QR dán trên bàn ăn (nhập mã 6 số bàn) hoặc mã QR đặt tại quầy thu ngân.',
      icon: QrCode,
      color: 'bg-[#E8F4F0] text-[#1D725E] border-[#C6E7DC]',
    },
    {
      step: '2',
      title: 'Chọn món yêu thích',
      description:
        'Xem thực đơn có ảnh món và giá rõ ràng. Thêm món vào giỏ, ghi chú theo sở thích (ít cay, không hành...) rồi bấm gửi đơn.',
      icon: ClipboardList,
      color: 'bg-[#EBF3FB] text-[#1D528A] border-[#D0E2F7]',
    },
    {
      step: '3',
      title: 'Thong thả nhận món',
      description:
        'Điện thoại sẽ báo khi bếp bắt đầu nấu và khi món sẵn sàng. Khách ngồi bàn được bưng món tận nơi; khách mua về ra quầy nhận món.',
      icon: CheckCircle,
      color: 'bg-[#E8F4F0] text-[#165B4B] border-[#C6E7DC]',
    },
  ];

  return (
    <section id="how-it-works" className="py-12 sm:py-16 lg:py-20 bg-[#FAFBFB] border-y border-[#E9ECEA] scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tiêu đề section */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="text-xs font-bold text-[#1D725E] uppercase tracking-wider bg-[#E8F4F0] px-3 py-1 rounded-full border border-[#C6E7DC]">
            Hướng dẫn sử dụng
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1D2522] tracking-tight mt-3">
            Chỉ 3 bước đơn giản
          </h2>
          <p className="text-sm sm:text-base text-[#55605C] mt-2.5">
            Không cần cài đặt ứng dụng, không cần đăng ký tài khoản. Bạn có thể gọi món ngay trên trình duyệt điện thoại.
          </p>
        </div>

        {/* 3 Bước */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {steps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="bg-[#FFFFFF] rounded-3xl border border-[#E9ECEA] p-6 sm:p-7 shadow-xs relative flex flex-col justify-between"
              >
                <div>
                  {/* Header bước với số thứ tự và icon */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="w-8 h-8 rounded-full bg-[#F5F6F5] text-[#1D2522] font-extrabold text-sm flex items-center justify-center border border-[#E9ECEA]">
                      {item.step}
                    </span>
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${item.color}`}>
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-[#1D2522] tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#55605C] mt-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {idx < steps.length - 1 && (
                  <div className="hidden md:flex justify-end mt-4 text-[#C6CECB]">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Hướng dẫn thanh toán rõ ràng */}
        <div className="mt-8 sm:mt-10 max-w-3xl mx-auto p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#E9ECEA] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#55605C]">
          <div className="flex items-start sm:items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#1D725E] shrink-0 mt-1 sm:mt-0" />
            <div>
              <strong className="text-[#1D2522] font-semibold">Quy tắc thanh toán: </strong>
              <span>Ăn tại bàn thanh toán khi dùng bữa xong · Mua mang về chuyển khoản VietQR tự động để quán nấu món ngay.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
