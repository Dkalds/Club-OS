import { defineConfig } from "@playwright/test";
import { readE2eTarget } from "./scripts/lib/e2e-target";

// Sin `BASE_URL`, los e2e construyen y arrancan la app en localhost:3000. Con ella, prueban
// esa URL ya desplegada (la preview) y no arrancan nada. Qué cambia entonces (sin traza ni
// vídeo contra un remoto, la cabecera de la protección de Vercel) y qué se exige al
// Supabase del runner está en `scripts/lib/e2e-target.ts`; ver «Entorno remoto» en el README.
const target = readE2eTarget(process.env);

export default defineConfig({
  testDir: "./e2e",
  // Con Supabase local: siembra la base de datos justo antes de los tests, les pasa el
  // instante de la siembra y guarda una sesión por usuario. Con uno remoto no escribe nada.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: target.use,
  projects: [
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: target.startServer
    ? {
        command: "pnpm build && pnpm start",
        url: target.baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      }
    : undefined,
});
