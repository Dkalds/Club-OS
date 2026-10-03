import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { loginAs } from "./auth";

// ── Una sesión por usuario y por ejecución ───────────────────────────────────────────
// Auth limita las verificaciones de código por IP (en local, 30 cada 5 minutos) y todas
// salen del mismo servidor de Next. Si cada test entrara por su cuenta, la suite agotaría
// ese cupo en cuanto creciera un poco. Por eso `e2e/global-setup.ts` entra UNA vez como
// cada usuario de `SESSION_USERS` y guarda su sesión (el `storageState` de Playwright); los
// tests que solo necesitan «estar dentro como X» la reutilizan con `openAs`.
//
// El login en sí (pedir el código, teclearlo, salir) lo sigue probando `e2e/auth.spec.ts`
// con `loginAs`.

/** Carpeta de las sesiones guardadas. Ignorada por git; se vacía en cada ejecución. */
export const SESSION_DIR = path.resolve(import.meta.dirname, "../.auth");

/** Los usuarios del seed con los que los specs entran sin probar el login. */
export const SESSION_USERS = [
  "alex@arcangel.test", // entrenador de Alevín A
  "nora@arcangel.test", // entrenadora de Benjamín A, mismo club
  "raul@arcangel.test", // dirección, sin equipo
  "marta@demo.test", // entrenadora del otro club
] as const;

export function sessionFile(email: string): string {
  return path.join(SESSION_DIR, `${encodeURIComponent(email)}.json`);
}

type StoredCookies = Parameters<BrowserContext["addCookies"]>[0];

/**
 * Deja la página dentro de la app como `email`, con la sesión que guardó el arranque
 * global, sin pasar por el login.
 *
 * Mismo contrato que `loginAs`: al volver, la página ya está en su destino, /c/{slug} si
 * la cuenta tiene un solo club o el selector (/select-club) si tiene varios o ninguno.
 * Entra como al abrir la app: la raíz lleva al selector y este, con un solo club, a él.
 *
 * La sesión es una copia: cada test tiene su propio contexto de navegador, así que varios
 * tests pueden estar dentro a la vez como la misma persona. Llamarla otra vez en el mismo
 * test cambia de persona.
 *
 * Si no hay sesión guardada para `email`, entra con `loginAs`. Pasa con un usuario que no
 * está en `SESSION_USERS` y cuando los e2e apuntan a un Supabase que no es local: ahí el
 * arranque global ni siembra ni entra por nadie.
 */
export async function openAs(page: Page, email: string): Promise<void> {
  const file = sessionFile(email);
  if (!existsSync(file)) {
    await loginAs(page, email);
    return;
  }

  const { cookies } = JSON.parse(await readFile(file, "utf8")) as { cookies: StoredCookies };
  const context = page.context();
  await context.clearCookies();
  await context.addCookies(cookies);

  await page.goto("/");
  if (new URL(page.url()).pathname === "/login") {
    throw new Error(
      `La sesión guardada de ${email} ya no vale: la app ha pedido entrar otra vez. ` +
        "Las sesiones son de una ejecución; relanza los e2e (`pnpm test:e2e`).",
    );
  }
}
