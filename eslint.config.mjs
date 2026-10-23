import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  // Frozen contracts are reviewed separately; application source stays fully checked.
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "docs/**"]),
]);
