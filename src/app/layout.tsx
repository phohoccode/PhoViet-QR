import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import "@/app/globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#35977d",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Phở Việt | Đặt món bằng QR",
  description: "Quét QR, xem thực đơn và đặt món nhanh chóng tại Phở Việt.",

  manifest: "/site.webmanifest",

  icons: {
    icon: [
      {
        url: "/favicon.ico?v=3",
        sizes: "any",
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico?v=3",
  },

  openGraph: {
    title: "Phở Việt | Đặt món bằng QR",
    description: "Quét QR, xem thực đơn và đặt món nhanh chóng tại Phở Việt.",
    type: "website",
    images: [
      {
        url: "/social/share-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Phở Việt – Đặt món bằng QR",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Phở Việt | Đặt món bằng QR",
    images: ["/social/share-1200x630.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body className={beVietnamPro.variable}>{children}</body>
    </html>
  );
}
