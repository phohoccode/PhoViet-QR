'use client';

import React from 'react';
import {
  Users,
  Store,
  Clock3,
  ThumbsUp,
  Receipt,
  CheckCircle,
  ChefHat,
  Sparkles,
} from 'lucide-react';

export const HomeBenefitsSection: React.FC = () => {
  return (
    <section id="benefits" className="py-12 sm:py-16 lg:py-20 bg-[#FAFBFB] border-y border-[#E9ECEA] scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Tiêu đề section */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="text-xs font-bold text-[#1D725E] uppercase tracking-wider bg-[#E8F4F0] px-3 py-1 rounded-full border border-[#C6E7DC]">
            Lợi ích thiết thực
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#1D2522] tracking-tight mt-3">
            Website này giúp gì cho bạn?
          </h2>
          <p className="text-sm sm:text-base text-[#55605C] mt-2.5">
            Dù bạn là khách ghé ăn hay chủ quán muốn phục vụ tốt hơn, hệ thống đều mang lại trải nghiệm nhẹ nhàng và tiện lợi nhất.
          </p>
        </div>

        {/* 2 Khối lợi ích song song: Khách hàng & Quán ăn */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* CỘT 1: Dành cho Khách hàng */}
          <div className="bg-[#FFFFFF] rounded-3xl border border-[#E9ECEA] p-6 sm:p-8 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#F0F2F1]">
                <div className="w-10 h-10 rounded-xl bg-[#E8F4F0] text-[#1D725E] border border-[#C6E7DC] flex items-center justify-center">
                  <Users className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#1D2522]">
                    Dành cho bạn khi đến quán
                  </h3>
                  <p className="text-xs text-[#727B77]">Gọi món chủ động, thư thả tận hưởng bữa ăn</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Tự do xem thực đơn có hình ảnh &amp; giá</strong>
                    Không bị hối thúc. Bạn có thể thoải mái chọn món, thêm ghi chú (ít đường, không hành, đá riêng...) theo đúng ý mình.
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center shrink-0 mt-0.5">
                    <ThumbsUp className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Không cần vẫy tay gọi nhân viên</strong>
                    Đang ăn muốn gọi thêm đĩa quẩy hay ly trà? Chỉ cần chọn trên điện thoại là bếp nhận đơn ngay, không cần chờ nhân viên rảnh tay.
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center shrink-0 mt-0.5">
                    <Clock3 className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Biết rõ khi nào món nấu xong</strong>
                    Màn hình tự động cập nhật: Đã nhận đơn → Bếp đang nấu → Sẵn sàng, giúp bạn an tâm không lo bị sót đơn.
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#E8F4F0] text-[#1D725E] flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Ai đến trước được làm trước</strong>
                    Mọi món ăn đều được hệ thống xếp thứ tự công bằng, không bao giờ xảy ra tình trạng khách đến sau lại có món trước.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT 2: Dành cho Chủ quán & Nhân viên */}
          <div className="bg-[#FFFFFF] rounded-3xl border border-[#E9ECEA] p-6 sm:p-8 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#F0F2F1]">
                <div className="w-10 h-10 rounded-xl bg-[#EBF3FB] text-[#1D528A] border border-[#D0E2F7] flex items-center justify-center">
                  <Store className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#1D2522]">
                    Dành cho Quán ăn &amp; Bếp
                  </h3>
                  <p className="text-xs text-[#727B77]">Vận hành nhẹ nhàng, phục vụ nhanh giờ cao điểm</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#EBF3FB] text-[#1D528A] flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Giảm tải nhân viên lúc quán đông khách</strong>
                    Khách tự gọi món trên điện thoại, nhân viên không phải chạy đi chạy lại ghi chép giấy hay chen chúc ghi món ở quầy.
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#EBF3FB] text-[#1D528A] flex items-center justify-center shrink-0 mt-0.5">
                    <ChefHat className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Bếp nhận đơn tức thì, không sót bàn</strong>
                    Đơn món kèm ghi chú chi tiết của khách bay thẳng vào màn hình bếp ngay khi khách gửi, không lo ghi chép chữ xấu hay nhầm bàn.
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#EBF3FB] text-[#1D528A] flex items-center justify-center shrink-0 mt-0.5">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Thu tiền tự động cho đơn mang về</strong>
                    Khách mua về chuyển khoản ngân hàng là tiền về đúng tài khoản quán, hệ thống tự xác nhận để bếp làm ngay, không sợ nhầm bill.
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-full bg-[#EBF3FB] text-[#1D528A] flex items-center justify-center shrink-0 mt-0.5">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-[#55605C]">
                    <strong className="text-[#1D2522] block font-semibold">Mọi quản lý gọn gàng trong một trang</strong>
                    Chủ quán chỉ cần đăng nhập một màn hình duy nhất là quản lý được cả hàng đợi nấu ăn, tình trạng bàn và danh mục thực đơn.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
