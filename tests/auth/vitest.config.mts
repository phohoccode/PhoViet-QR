import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("../../src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./server-only-stub.ts", import.meta.url)),
  } },
  test: { include: ["tests/auth/**/*.test.ts"], environment: "node", clearMocks: true },
});
