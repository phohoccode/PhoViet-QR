import { defineConfig } from "vitest/config";
import auth from "../../auth/vitest.config.mts";
export default defineConfig({ resolve: auth.resolve, test: { include: ["tests/integration/menu/**/*.test.ts"], environment: "node", hookTimeout: 60000, testTimeout: 30000, fileParallelism: false } });
