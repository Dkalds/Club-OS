import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Salidas de test y herramientas.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Carpetas de agentes y worktrees: no son código del proyecto.
    ".claude/**",
    ".worktrees/**",
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
