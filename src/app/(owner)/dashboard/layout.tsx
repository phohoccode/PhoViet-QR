import type { ReactNode } from "react";
import { requireOwner } from "@/server/auth/require-owner";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return children;
}
