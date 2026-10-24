import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL ? (() => {
        const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
        return url.protocol === "https:" ? [{ protocol: "https" as const, hostname: url.hostname, port: "", pathname: "/storage/v1/object/public/menu-images/stores/**", search: "" }] : [];
      })() : []),
    ],
  },
  // Keep dev from creating documentation outside this bootstrap's file ownership.
  agentRules: false,
};

export default nextConfig;
