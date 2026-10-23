import { defineConfig } from "vitest/config";
import authConfig from "../auth/vitest.config.mts";

export default defineConfig({
  resolve: authConfig.resolve,
  test: { include: ["tests/db/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000, fileParallelism: false },
});
