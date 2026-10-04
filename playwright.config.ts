import { defineConfig } from "@playwright/test";
import { readE2eTarget } from "./scripts/lib/e2e-target";

// Sin `BASE_URL`, los e2e construyen y arrancan la app en localhost:3000, o en el puerto de
// `PORT` (así dos checkouts pasan los e2e a la vez sin pisarse el servidor). Con ella, prueban
// esa URL ya desplegada (la preview) y no arrancan nada. Qué cambia entonces (sin traza ni
// vídeo contra un remoto; el secreto de la protección de Vercel solo hacia el origen de la
// app, en el fixture `protectionBypass`) y qué se exige al Supabase del runner está en
// `scripts/lib/e2e-target.ts`; ver «Entorno remoto» en el README.
const target = readE2eTarget(process.env);

// Los e2e que modifican datos del seed (Gestión, la ficha de ejercicio y los editores de las
// fases siguientes) van en su propio proyecto, `admin`: en serie y después de `mobile`.
// `mobile` casi solo lee: el único que escribe es `way.spec.ts`, que crea borradores suyos y
// los borra al acabar. Cada fase que añade uno de esos specs lo suma a esta lista; `mobile`
// la ignora.
//
// Ninguno de los dos proyectos depende de que el otro limpie: `e2e/global-setup.ts` borra, antes
// de empezar, lo que una ejecución abortada dejara en la metodología y en los ejercicios (`restoreSeed`). Sin eso,
// una ejecución de `admin` matada a medias haría fallar a `mobile`, y `admin` (que no corre si
// `mobile` falla) no volvería a limpiar nunca.
const ADMIN_SPECS = [/admin\.spec\.ts/, /drill-detail\.spec\.ts/];

// La pantalla de referencia del móvil.
const MOBILE_VIEWPORT = { width: 375, height: 812 };

export default defineConfig({
  testDir: "./e2e",
  // Con Supabase local: siembra la base de datos justo antes de los tests, les pasa el
  // instante de la siembra y guarda una sesión por usuario. Con uno remoto no siembra ni entra por nadie.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: target.use,
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
  webServer: target.startServer
    ? {
        command: "pnpm build && pnpm start",
        url: target.baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      }
    : undefined,
});
