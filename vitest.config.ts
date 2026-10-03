import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Tres proyectos:
//  - node: unidad (src/** salvo src/ui/**, scripts/**)
//  - ui:   componentes (src/ui/**) en jsdom
//  - int:  integración contra Supabase local (**/*.int.test.ts)
// `pnpm test` ejecuta node + ui; `pnpm test:int` ejecuta solo int.

// Carpetas de agentes y worktrees: copias del repo que no son código del proyecto. Sus
// tests (por ejemplo `**/*.int.test.ts`) no deben ejecutarse desde la raíz.
const AGENT_DIRS = [".claude/**", ".worktrees/**", ".superpowers/**"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...AGENT_DIRS, "**/*.int.test.ts", "src/ui/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/ui/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...AGENT_DIRS, "**/*.int.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "int",
          environment: "node",
          include: ["**/*.int.test.ts"],
          exclude: [...configDefaults.exclude, ...AGENT_DIRS],
        },
      },
    ],
  },
});
