import { defineConfig } from "@playwright/test";

// `PORT` deja que dos checkouts (worktrees) pasen los e2e a la vez sin pisarse el servidor:
// `next start` lo lee del entorno y aquí se apunta al mismo puerto.
const baseURL = `http://localhost:${process.env.PORT ?? "3000"}`;

// Los e2e que modifican datos del seed (Gestión y los editores de las fases siguientes) van
// en su propio proyecto, `admin`: en serie y después de `mobile`, que solo lee. Cada fase
// que añade uno de esos specs lo suma a esta lista; `mobile` la ignora.
const ADMIN_SPECS = [/admin\.spec\.ts/];

// La pantalla de referencia del móvil.
const MOBILE_VIEWPORT = { width: 375, height: 812 };

export default defineConfig({
  testDir: "./e2e",
  // Con Supabase local: siembra la base de datos justo antes de los tests, les pasa el
  // instante de la siembra y guarda una sesión por usuario. Con uno remoto no escribe nada.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      testIgnore: ADMIN_SPECS,
      use: {
        browserName: "chromium",
        viewport: MOBILE_VIEWPORT,
      },
    },
    {
      name: "admin",
      testMatch: ADMIN_SPECS,
      // Escriben en la base de datos compartida: un worker, un test detrás de otro. Y solo
      // si `mobile` ha pasado, para no escribir sobre un seed que ya está roto.
      fullyParallel: false,
      workers: 1,
      dependencies: ["mobile"],
      use: {
        browserName: "chromium",
        viewport: MOBILE_VIEWPORT,
      },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
