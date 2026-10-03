import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { createAdminClient } from "../../scripts/lib/admin-client";

/**
 * Entra en la app como un usuario del seed, por el mismo camino que una persona:
 * escribe el email, pide el código y lo teclea. El código no se lee de ningún buzón:
 * se genera con la API de administración (`generateLink` → `email_otp`).
 *
 * Al volver, la página ya está en su destino: /c/{slug} si la cuenta tiene un solo club,
 * o el selector (/select-club) si tiene varios o ninguno.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  // Con sesión, /login redirige al selector y el formulario no llegaría a verse.
  await page.context().clearCookies();

  await withLoginLock(email, async () => {
    await submitEmail(page, email);

    // El paso del código solo aparece cuando la acción del servidor ha terminado: la app
    // ya ha pedido su propio código (o Auth lo ha rechazado por frecuencia; la pantalla
    // es la misma). El que se genera ahora es el último y sustituye al de la app.
    await page.getByLabel("Código", { exact: true }).fill(await generateLoginCode(email));
    await page.getByRole("button", { name: "Entrar" }).click();

    await waitForLanding(page);
  });
}

/** Pide un código para `email` y se queda en el paso del código, sin entrar. */
export async function requestCodeFor(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await withLoginLock(email, () => submitEmail(page, email));
}

async function submitEmail(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByLabel("Código", { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function generateLoginCode(email: string): Promise<string> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    throw new Error(
      `No se pudo generar el código de ${email}: ${error?.message ?? "la respuesta no trae email_otp"}. ` +
        "¿Está arrancado Supabase y se ha ejecutado `pnpm seed`?",
    );
  }
  return code;
}

/**
 * Tras «Entrar», la app va a /select-club y, si la cuenta tiene un solo club, salta de
 * ahí a /c/{slug}. Se espera al destino final: volver en mitad del salto dejaría al test
 * navegando a la vez que la app.
 */
async function waitForLanding(page: Page): Promise<void> {
  const selectorTitle = page.getByRole("heading", {
    level: 1,
    name: /^(Tus clubes|Tu cuenta no tiene acceso a ningún club)$/,
  });

  await expect(async () => {
    const { pathname } = new URL(page.url());
    if (pathname.startsWith("/c/")) return;
    expect(pathname, "sigue en /login: ¿código rechazado?").toBe("/select-club");
    await expect(selectorTitle).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

// ── Un código por usuario a la vez ───────────────────────────────────────────────────
// Auth guarda un solo código por usuario. Con varios workers, dos tests que piden código
// para el mismo email se lo pisarían entre `generateLink` y «Entrar». El candado es un
// directorio (crear un directorio es atómico) y vale para todos los workers de la
// ejecución, que comparten proceso padre.

const LOCK_ROOT = path.join(os.tmpdir(), `clubos-e2e-login-${process.ppid}`);
/** Un login tarda un par de segundos. Un candado más viejo es de un worker que murió. */
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 100;

async function withLoginLock<T>(email: string, run: () => Promise<T>): Promise<T> {
  const lock = path.join(LOCK_ROOT, encodeURIComponent(email));
  await mkdir(LOCK_ROOT, { recursive: true });

  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const created = await stat(lock).then(
        (stats) => stats.mtimeMs,
        () => null,
      );
      if (created !== null && Date.now() - created > LOCK_STALE_MS) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  try {
    return await run();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
