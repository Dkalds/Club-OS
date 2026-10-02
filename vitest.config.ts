import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tres proyectos:
//  - node: unidad (src/** salvo src/ui/**, scripts/**)
//  - ui:   componentes (src/ui/**) en jsdom
//  - int:  integración contra Supabase local (**/*.int.test.ts)
// `pnpm test` ejecuta node + ui; `pnpm test:int` ejecuta solo int.
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
          exclude: ["**/node_modules/**", "**/*.int.test.ts", "src/ui/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/ui/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/*.int.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "int",
          environment: "node",
          include: ["**/*.int.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
