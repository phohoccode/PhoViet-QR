import { describe, expect, it } from "vitest";
import { validateOwnerLogin } from "../../src/server/auth/login-validation";

function form(email?: string, password?: string) {
  const data = new FormData();
  if (email !== undefined) data.set("email", email);
  if (password !== undefined) data.set("password", password);
  return data;
}
describe("login validation", () => {
  it.each([
    [undefined, undefined, ["email", "password"]],
    ["not-an-email", "nonblank", ["email"]],
    ["owner@example.invalid", "", ["password"]],
    ["owner@example.invalid", "  ", ["password"]],
    ["owner@example.invalid", undefined, ["password"]],
  ])("rejects invalid or missing fields without echoing secrets", (email, password, keys) => {
    const result = validateOwnerLogin(form(email, password));
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.fieldErrors)).toEqual(keys);
    expect(JSON.stringify(result)).not.toContain("nonblank");
  });
  it("normalizes email but preserves meaningful password whitespace", () => {
    const result = validateOwnerLogin(form("  owner@example.invalid  ", "  meaningful password  "));
    expect(result).toEqual({ success: true, data: { email: "owner@example.invalid", password: "  meaningful password  " } });
  });
  it("rejects file-shaped credentials", () => {
    const data = form("owner@example.invalid");
    data.set("password", new Blob(["secret"]), "password.txt");
    expect(validateOwnerLogin(data).success).toBe(false);
  });
});
