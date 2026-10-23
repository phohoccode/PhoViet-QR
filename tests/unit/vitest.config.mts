import { defineConfig } from "vitest/config";
import authConfig from "../auth/vitest.config.mts";
export default defineConfig({ resolve: authConfig.resolve, test: { include: ["tests/unit/**/*.test.ts"], environment: "node", clearMocks: true } });
