import { defineConfig } from "vitest/config";
import authConfig from "../../auth/vitest.config.mts";
export default defineConfig({ resolve: authConfig.resolve, test: { include: ["tests/unit/cart/**/*.test.ts"], environment: "node", clearMocks: true } });
