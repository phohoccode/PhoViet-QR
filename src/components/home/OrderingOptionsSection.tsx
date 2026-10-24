'use client';

import React from 'react';
import {
  UtensilsCrossed,
  ShoppingBag,
  ShieldCheck,
  QrCode,
  CreditCard,
  Hash,
  Info,
} from 'lucide-react';

export const OrderingOptionsSection: React.FC = () => {
  return (
    <section id="ordering-options" className="py-12 sm:py-16 lg:py-20 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tiêu đề section */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="text-xs font-bold text-[#1D725E] uppercase tracking-wider bg-[#E8F4F0] px-3 py-1 rounded-full border border-[#C6E7DC]">
            Hai cách gọi món tại quán
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1D2522] tracking-tight mt-3">
            Dành cho cả khách ăn tại chỗ và mua mang về
          </h2>
          <p className="text-sm sm:text-base text-[#55605C] mt-2.5">
            Dù bạn ngồi ăn tại bàn hay ghé quầy mua mang về, chiếc điện thoại của bạn đều trở thành cuốn thực đơn thông minh giúp bạn gọi món nhanh nhất.
          </p>
        </div>

        {/* 2 Card lớn cạnh nhau */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* CARD 1: Ăn tại bàn */}
          <div className="bg-[#FFFFFF] rounded-3xl border border-[#E9ECEA] p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:border-[#35977D]/40 transition-all">
            <div>
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#E8F4F0] border border-[#C6E7DC] flex items-center justify-center text-[#1D725E]">
                  <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FAFBFB] text-[#55605C] border border-[#E9ECEA]">
                  Ăn tại chỗ
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-[#1D2522] tracking-tight">
                Dùng tại bàn
              </h3>
              <p className="text-sm text-[#55605C] mt-2 leading-relaxed">
                Quét mã QR dán sẵn trên bàn ăn của bạn để xem thực đơn, chọn món và gửi thẳng vào bếp. Bạn có thể thoải mái gọi thêm món mới bất cứ lúc nào trong bữa ăn.
              </p>

              {/* Danh sách đặc điểm nổi bật bằng ngôn ngữ dễ hiểu */}
              <div className="mt-6 space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-center shrink-0 mt-0.5 text-[#1D725E]">
                    <QrCode className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Mã QR dán cố định trên bàn</strong>
                    Mỗi bàn có một mã QR riêng, giúp nhân viên quán biết chính xác bạn đang ngồi đâu để bưng món đến tận nơi.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-center shrink-0 mt-0.5 text-[#1D725E]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Bảo mật bằng mã số bàn (PIN 6 số)</strong>
                    Khi bạn vào bàn, quán cung cấp mã số 6 chữ số để mở thực đơn. Mã này giúp bảo vệ bàn của bạn, tránh người ngoài bấm nhầm.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-center shrink-0 mt-0.5 text-[#1D725E]">
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Thanh toán khi kết thúc bữa ăn</strong>
                    Gọi thêm món tùy thích trong suốt bữa ăn. Khi ăn xong chuẩn bị về, bạn mới cần thanh toán một lần với quán.
                  </div>
                </div>
              </div>
            </div>

            {/* Hướng dẫn thực tế chân card */}
            <div className="mt-8 pt-4 border-t border-[#F0F2F1] flex items-center gap-2 text-xs text-[#727B77]">
              <Info className="w-4 h-4 text-[#35977D] shrink-0" />
              <span>Khi đến quán, bạn chỉ cần ngồi vào bàn và quét mã QR dán trên mặt bàn.</span>
            </div>
          </div>

          {/* CARD 2: Mua mang về */}
          <div className="bg-[#FFFFFF] rounded-3xl border border-[#E9ECEA] p-6 sm:p-8 flex flex-col justify-between shadow-xs hover:border-[#35977D]/40 transition-all">
            <div>
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-[#EBF3FB] border border-[#D0E2F7] flex items-center justify-center text-[#1D528A]">
                  <ShoppingBag className="w-6 h-6" aria-hidden="true" />
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FAFBFB] text-[#55605C] border border-[#E9ECEA]">
                  Mua mang về
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-[#1D2522] tracking-tight">
                Mua mang về
              </h3>
              <p className="text-sm text-[#55605C] mt-2 leading-relaxed">
                Quét mã QR đặt tại quầy thu ngân để tự chọn món trên điện thoại mà không cần chen chúc. Chuyển khoản ngân hàng tự động và nhận số thứ tự lấy món.
              </p>

              {/* Danh sách đặc điểm nổi bật */}
              <div className="mt-6 space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-center shrink-0 mt-0.5 text-[#1D528A]">
                    <QrCode className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Dùng chung mã QR tại quầy</strong>
                    Không cần mã số bàn. Mỗi người tự chọn món trên điện thoại của mình, đơn của ai tính riêng của người đó.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-center shrink-0 mt-0.5 text-[#1D528A]">
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Thanh toán VietQR tự động</strong>
                    Quét mã QR chuyển khoản ngay trên điện thoại. Tiền vào là bếp nhận đơn làm ngay, không cần đứng đợi nhân viên kiểm tra tài khoản.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-[#FAFBFB] border border-[#E9ECEA] flex items-center justify-center shrink-0 mt-0.5 text-[#1D528A]">
                    <Hash className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Phục vụ đúng thứ tự &amp; mã nhận món 6 số</strong>
                    Bếp nấu công bằng theo thứ tự ai đặt trước làm trước. Màn hình sẽ cấp mã nhận món 6 số để bạn đến quầy lấy đúng phần ăn của mình.
                  </div>
                </div>
              </div>
            </div>

            {/* Hướng dẫn thực tế chân card */}
            <div className="mt-8 pt-4 border-t border-[#F0F2F1] flex items-center gap-2 text-xs text-[#727B77]">
              <Info className="w-4 h-4 text-[#1D528A] shrink-0" />
              <span>Khi đến quán, bạn chỉ cần quét mã QR đặt ngay tại quầy thu ngân.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
