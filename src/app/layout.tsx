import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import "@/app/globals.css";

// Requested by Gemini P1_G01_REVIEW §4; CSS consumes this existing font variable.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QR Ordering",
  description: "QR Ordering Minimal MVP",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body className={beVietnamPro.variable}>{children}</body>
    </html>
  );
}
