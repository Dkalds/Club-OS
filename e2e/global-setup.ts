import { mkdir, rm } from "node:fs/promises";
import { chromium, type FullConfig } from "@playwright/test";
import { loadEnvLocal, readSupabaseEnv } from "../scripts/lib/admin-client";
import { checkRunnerSupabase, readE2eTarget } from "../scripts/lib/e2e-target";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { runSeed } from "../scripts/seed/run";
import { loginAs } from "./helpers/auth";
import { SEED_NOW_ENV } from "./helpers/seed";
import { SESSION_DIR, SESSION_USERS, sessionFile } from "./helpers/sessions";

/**
 * Arranque global de los e2e. Con un Supabase LOCAL hace tres cosas, en este orden:
 *
 * 1. Vuelve a sembrar la base de datos justo antes de los tests.
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
 * Antes de nada comprueba que los tests y la app hablan con el mismo Supabase: con
 * `BASE_URL` apuntando a una app desplegada, el runner necesita el Supabase remoto de esa
 * app (ver `checkRunnerSupabase`). Si no, falla aquí con un solo mensaje, antes de que corra
 * ningún test.
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

  // `.env.local` se carga ya para saber a qué Supabase apunta el runner. Lo que haya en la
  // shell manda sobre el fichero.
  loadEnvLocal();
  const target = readE2eTarget(process.env);
  const mismatch = checkRunnerSupabase(target, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (mismatch !== null) throw plainFailure(mismatch);

  // Las sesiones guardadas son de una ejecución y de un destino: las anteriores no valen.
  await rm(SESSION_DIR, { recursive: true, force: true });

  let supabaseUrl: string;
  try {
    supabaseUrl = readSupabaseEnv().url;
  } catch (error) {
    throw target.remote
      ? setupFailure("No se pudo leer el Supabase de los e2e.", error, REMOTE_HINT)
      : setupFailure("No se pudieron sembrar los datos de los e2e.", error);
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
    await runSeed(seededAt);
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

const LOCAL_HINT =
  "Los e2e necesitan el Supabase local arrancado (`pnpm supabase start`) y un " +
  "`.env.local` con su URL y sus claves (`pnpm supabase status -o env`; ver .env.example).";

const REMOTE_HINT =
  "Contra una app desplegada (BASE_URL), los e2e necesitan en la shell NEXT_PUBLIC_SUPABASE_URL " +
  "y SUPABASE_SERVICE_ROLE_KEY del proyecto remoto, y que ese entorno ya esté sembrado. " +
  "Ver «Entorno remoto» en el README.";

/**
 * Un solo error, legible, para lo que suele pasar: falta `.env.local` o Supabase no está
 * arrancado. Sin esto fallarían los tests uno a uno, cada uno con su traza.
 */
function setupFailure(what: string, cause: unknown, hint = LOCAL_HINT): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return plainFailure(`${what} ${reason}\n\n${hint}`);
}

/** Un error sin pila: apuntaría a esta línea, no a la causa, que ya va en el mensaje. */
function plainFailure(message: string): Error {
  const failure = new Error(message);
  failure.stack = `${failure.name}: ${failure.message}`;
  return failure;
}
