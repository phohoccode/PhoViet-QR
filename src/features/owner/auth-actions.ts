"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateOwnerLogin } from "@/server/auth/login-validation";
import { verifyOwner } from "@/server/auth/verify-owner";

export type OwnerLoginActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: { email?: string; password?: string };
};

const LOGIN_ERROR = "Không thể đăng nhập. Vui lòng kiểm tra thông tin hoặc liên hệ quản trị quán.";

export async function signInOwnerAction(
  _previousState: OwnerLoginActionState,
  formData: FormData,
): Promise<OwnerLoginActionState> {
  const input = validateOwnerLogin(formData);
  if (!input.success) {
    return { status: "error", message: "Vui lòng kiểm tra thông tin đăng nhập.", fieldErrors: input.fieldErrors };
  }

  try {
    const client = await createServerSupabaseClient({ cookieMode: "write" });
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) return { status: "error", message: LOGIN_ERROR };

    try {
      const owner = await verifyOwner(client);
      if (!owner) throw new Error("Owner authentication required");
    } catch {
      // Do not retain the new session when membership verification fails.
      await client.auth.signOut({ scope: "local" });
      return { status: "error", message: LOGIN_ERROR };
    }
  } catch {
    return { status: "error", message: LOGIN_ERROR };
  }
  // Next redirect throws; never swallow it in the provider error handler.
  redirect("/dashboard");
}

export async function signOutOwnerAction(): Promise<void> {
  const client = await createServerSupabaseClient({ cookieMode: "write" });
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("Không thể đăng xuất. Vui lòng thử lại.");
  redirect("/login");
}
