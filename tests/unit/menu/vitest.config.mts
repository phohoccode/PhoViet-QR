import { defineConfig } from "vitest/config";
import auth from "../../auth/vitest.config.mts";
export default defineConfig({ resolve: auth.resolve, test: { include: ["tests/unit/menu/**/*.test.ts"], environment: "node", clearMocks: true } });
