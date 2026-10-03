import { mkdir, rm } from "node:fs/promises";
import { chromium, type FullConfig } from "@playwright/test";
import { readSupabaseEnv } from "../scripts/lib/admin-client";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { loginAs } from "./helpers/auth";
import { restoreSeed, SEED_NOW_ENV } from "./helpers/seed";
import { SESSION_DIR, SESSION_USERS, sessionFile } from "./helpers/sessions";

/**
 * Arranque global de los e2e. Con un Supabase LOCAL hace tres cosas, en este orden:
 *
 * 1. Deja la base de datos como la deja el seed, justo antes de los tests: borra lo que una
 *    ejecución anterior abortada pudo dejar en la metodología (`restoreSeed`) y vuelve a sembrar.
 * 2. Les deja el instante de esa siembra (`seedNow()` en `helpers/seed.ts`).
 * 3. Entra una vez como cada usuario de `SESSION_USERS` y guarda su sesión, para que los
 *    tests la reutilicen (`openAs` en `helpers/sessions.ts`) en vez de entrar cada uno.
 *
 * Por qué sembrar aquí: las fechas del seed son relativas al momento en que se siembra. Si
 * entre un `pnpm seed` y los tests pasa un rato, lo sembrado envejece: el «próximo
 * entrenamiento» ya terminó, el partido ya se jugó, y los tests de Inicio fallan sin que
 * nada esté roto. Sembrando aquí, lo que hay en la base de datos es siempre de esta misma
 * ejecución. Es el mismo seed de `pnpm seed`: idempotente (actualiza por id, no duplica).
 *
 * Por qué borrar antes: el seed solo actualiza lo suyo. Una ejecución abortada de `admin`
 * (que crea una sección y un Standard) o de `way` (que crea borradores) dejaría esas filas, y
 * `mobile`, que corre primero y espera exactamente las del seed, fallaría; `admin`, cuya
 * dependencia ha fallado, no correría y no las limpiaría nunca. Así la suite se recupera sola.
 *
 * Con un Supabase que NO es local (los e2e contra una preview) no siembra ni entra por
 * nadie, diga lo que diga `ALLOW_REMOTE_SEED`: lanzar unos tests nunca escribe en una base
 * de datos remota. Entonces:
 *  - Los datos tienen que estar ya sembrados en el destino (`pnpm seed`, a mano y a
 *    propósito, con `ALLOW_REMOTE_SEED=true`).
 *  - El instante de la siembra es el que traiga `E2E_SEED_NOW` (una fecha ISO: cuándo se
 *    sembró el destino) y, si no viene, el de este arranque. Los tests de Inicio solo
 *    aciertan si esa siembra es reciente; los demás no dependen del calendario.
 *  - Sin sesiones guardadas, `openAs` entra con `loginAs`, como un test de acceso.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const startedAt = new Date();

  // Las sesiones guardadas son de una ejecución y de un destino: las anteriores no valen.
  await rm(SESSION_DIR, { recursive: true, force: true });

  let supabaseUrl: string;
  try {
    supabaseUrl = readSupabaseEnv().url;
  } catch (error) {
    throw setupFailure("No se pudieron sembrar los datos de los e2e.", error);
  }

  if (!isLocalSupabaseUrl(supabaseUrl)) {
    console.log(
      `e2e: ${hostOf(supabaseUrl)} no es un Supabase local. No se siembra ni se guardan ` +
        "sesiones: los tests usan los datos que ya haya en ese destino.",
    );
    if (!isIsoInstant(process.env[SEED_NOW_ENV])) {
      process.env[SEED_NOW_ENV] = startedAt.toISOString();
    }
    return;
  }

  const seededAt = new Date();
  try {
    await restoreSeed(seededAt);
  } catch (error) {
    throw setupFailure("No se pudieron sembrar los datos de los e2e.", error);
  }
  process.env[SEED_NOW_ENV] = seededAt.toISOString();

  await saveSessions(config);
}

/** Un login por usuario, uno detrás de otro, cada uno en su propio contexto de navegador. */
async function saveSessions(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  await mkdir(SESSION_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const email of SESSION_USERS) {
      const context = await browser.newContext({ baseURL });
      try {
        await loginAs(await context.newPage(), email);
        // Las cookies de sesión son httpOnly y, en el build de producción, Secure: el
        // `storageState` las guarda igualmente y Chromium las acepta en http://localhost.
        await context.storageState({ path: sessionFile(email) });
      } catch (error) {
        throw setupFailure(`No se pudo guardar la sesión de ${email} para los e2e.`, error);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).host : "la URL de Supabase (no se puede interpretar)";
}

function isIsoInstant(value: string | undefined): boolean {
  return value !== undefined && value !== "" && !Number.isNaN(new Date(value).getTime());
}

/**
 * Un solo error, legible, para lo que suele pasar: falta `.env.local` o Supabase no está
 * arrancado. Sin esto fallarían los tests uno a uno, cada uno con su traza. La pila se
 * quita a propósito: apuntaría a esta línea, no a la causa, que ya va en el mensaje.
 */
function setupFailure(what: string, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const failure = new Error(
    `${what} ${reason}\n\n` +
      "Los e2e necesitan el Supabase local arrancado (`pnpm supabase start`) y un " +
      "`.env.local` con su URL y sus claves (`pnpm supabase status -o env`; ver .env.example).",
  );
  failure.stack = `${failure.name}: ${failure.message}`;
  return failure;
}
