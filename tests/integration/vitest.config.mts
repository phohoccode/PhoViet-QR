import { defineConfig } from "vitest/config";
import authConfig from "../auth/vitest.config.mts";
export default defineConfig({ resolve: authConfig.resolve, test: { include: ["tests/integration/**/*.test.ts"], environment: "node", hookTimeout: 60000, testTimeout: 30000, fileParallelism: false } });
