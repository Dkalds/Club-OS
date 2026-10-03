import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { createAdminClient } from "../../scripts/lib/admin-client";

const INVALID_CODE = "El código no es válido o ha caducado. Pide uno nuevo.";
/** Con el candado, solo la petición de la propia app puede pisar un código: sobra con 3. */
const MAX_CODE_ATTEMPTS = 3;
/** Margen para comparar la hora de este proceso con la que guarda Auth. */
const CLOCK_SLACK_MS = 1_000;

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
    const startedAt = Date.now();
    await submitEmail(page, email);

    // La app responde antes de pedir el código a Auth (lo hace con `after()`), así que su
    // petición puede llegar después que la nuestra y pisar el código generado. Se le da un
    // momento para que llegue primero; si aun así lo pisa, se genera otro y se reintenta.
    await codeRequestReachedAuth(email, startedAt);

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      await page.getByLabel("Código", { exact: true }).fill(await generateLoginCode(email));
      await page.getByRole("button", { name: "Entrar" }).click();
      if (await entered(page)) return;
    }
    throw new Error(
      `No se pudo entrar como ${email}: la app rechazó ${MAX_CODE_ATTEMPTS} códigos recién generados.`,
    );
  });
}

/** Pide un código para `email` y se queda en el paso del código, sin entrar. */
export async function requestCodeFor(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await withLoginLock(email, () => submitEmail(page, email));
}

/**
 * Cuándo guardó Auth el último código de acceso de `email` (ms desde epoch), o `null` si
 * la cuenta no existe o nunca ha pedido uno.
 */
export async function lastCodeSentAt(email: string): Promise<number | null> {
  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`No se pudo leer la lista de usuarios: ${error.message}`);
  const sentAt = data.users.find((user) => user.email === email)?.recovery_sent_at;
  return sentAt ? Date.parse(sentAt) : null;
}

async function submitEmail(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByLabel("Código", { exact: true })).toBeVisible({ timeout: 15_000 });
}

/**
 * Espera, como mucho un par de segundos, a que Auth tenga un código pedido desde `since`.
 * No falla si no llega: `loginAs` reintenta con un código nuevo si el suyo se queda viejo.
 */
async function codeRequestReachedAuth(email: string, since: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    const sentAt = await lastCodeSentAt(email);
    if (sentAt !== null && sentAt >= since - CLOCK_SLACK_MS) return;
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
 * Tras «Entrar», espera a que el intento termine y dice cómo: `true` si la página ya
 * está en su destino, `false` si la app ha rechazado el código.
 *
 * El destino es el final del camino: la app va a /select-club y, si la cuenta tiene un
 * solo club, salta de ahí a /c/{slug}. Volver en mitad del salto dejaría al test
 * navegando a la vez que la app.
 */
async function entered(page: Page): Promise<boolean> {
  const selectorTitle = page.getByRole("heading", {
    level: 1,
    name: /^(Tus clubes|Tu cuenta no tiene acceso a ningún club)$/,
  });
  const rejection = page.getByRole("alert").filter({ hasText: INVALID_CODE });
  const codeField = page.getByLabel("Código", { exact: true });
  const submit = page.getByRole("button", { name: "Entrar" });

  let landed = false;
  await expect(async () => {
    const { pathname } = new URL(page.url());
    if (pathname.startsWith("/c/")) {
      landed = true;
      return;
    }
    if (pathname === "/select-club") {
      await expect(selectorTitle).toBeVisible({ timeout: 1_000 });
      landed = true;
      return;
    }
    // Sigue en /login. El aviso puede ser de un intento anterior; el rechazo de este se
    // reconoce porque el formulario ha terminado: campo vacío y botón otra vez activo.
    await expect(rejection).toBeVisible({ timeout: 1_000 });
    await expect(codeField).toHaveValue("", { timeout: 1_000 });
    await expect(submit).toBeEnabled({ timeout: 1_000 });
    landed = false;
  }).toPass({ timeout: 15_000 });
  return landed;
}

// ── Un código por usuario a la vez ───────────────────────────────────────────────────
// Auth guarda un solo código por usuario. Con varios workers, dos tests que piden código
// para el mismo email se lo pisarían entre `generateLink` y «Entrar». El candado es un
// directorio (crear un directorio es atómico) y vale para todos los workers de la
// ejecución, que comparten proceso padre.

const LOCK_ROOT = path.join(os.tmpdir(), `clubos-e2e-login-${process.ppid}`);
/** Un login tarda unos segundos. Un candado más viejo es de un worker que murió. */
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 100;
/**
 * `EEXIST`: otro worker tiene el candado. Los otros tres los da Windows mientras termina
 * de borrarse el directorio del worker anterior; también significan «ocupado, espera».
 */
const LOCK_BUSY = new Set(["EEXIST", "EPERM", "EBUSY", "EACCES"]);

function releaseLock(lock: string): Promise<void> {
  return rm(lock, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function withLoginLock<T>(email: string, run: () => Promise<T>): Promise<T> {
  const lock = path.join(LOCK_ROOT, encodeURIComponent(email));
  await mkdir(LOCK_ROOT, { recursive: true });

  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if (!LOCK_BUSY.has((error as NodeJS.ErrnoException).code ?? "")) throw error;
      const created = await stat(lock).then(
        (stats) => stats.mtimeMs,
        () => null,
      );
      if (created !== null && Date.now() - created > LOCK_STALE_MS) {
        await releaseLock(lock);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  try {
    return await run();
  } finally {
    await releaseLock(lock);
  }
}
