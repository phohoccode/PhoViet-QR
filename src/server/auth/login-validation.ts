import { z } from "zod";

const loginSchema = z.object({
  email: z.email("Địa chỉ email không hợp lệ.").trim().max(254),
  // Password is never trimmed or echoed. Whitespace-only is invalid.
  password: z.string().min(1).max(1024).refine((value) => value.trim().length > 0),
});

export function validateOwnerLogin(formData: FormData) {
  const result = loginSchema.safeParse({
    email: typeof formData.get("email") === "string" ? (formData.get("email") as string).trim() : undefined,
    password: formData.get("password"),
  });
  if (result.success) return { success: true as const, data: result.data };

  const fieldErrors: { email?: string; password?: string } = {};
  for (const issue of result.error.issues) {
    if (issue.path[0] === "email") fieldErrors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
    if (issue.path[0] === "password") fieldErrors.password = "Vui lòng nhập mật khẩu hợp lệ.";
  }
  return { success: false as const, fieldErrors };
}
