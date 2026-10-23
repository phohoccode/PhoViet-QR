import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dev from creating documentation outside this bootstrap's file ownership.
  agentRules: false,
};

export default nextConfig;
