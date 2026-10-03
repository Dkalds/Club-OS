// Contra qué corren los e2e: la app local que arranca Playwright, o una URL ya desplegada
// (`BASE_URL`, por ejemplo la preview de Vercel). Son funciones puras: lo que deciden
// `playwright.config.ts` y `e2e/global-setup.ts` se prueba aquí, en `e2e-target.test.ts`.

import type { PlaywrightTestOptions, PlaywrightWorkerOptions } from "@playwright/test";
import { isLocalSupabaseUrl } from "../seed/guard";

const LOCAL_BASE_URL = "http://localhost:3000";

/** Con esta cabecera, Vercel deja pasar una automatización por su protección de despliegues. */
const BYPASS_HEADER = "x-vercel-protection-bypass";

type Env = Record<string, string | undefined>;

/** Lo que `playwright.config.ts` pone en `use`. */
export type E2eUse = Pick<PlaywrightTestOptions, "baseURL"> &
  Partial<Pick<PlaywrightTestOptions, "extraHTTPHeaders">> &
  Partial<Pick<PlaywrightWorkerOptions, "trace" | "video">>;

export type E2eTarget = {
  baseURL: string;
  /** `true` si la app no corre en esta máquina (el host de `baseURL` no es local). */
  remote: boolean;
  /** Playwright construye y arranca la app solo si nadie ha dicho dónde está ya. */
  startServer: boolean;
  use: E2eUse;
};

/** Una variable de entorno sin valor y una en blanco son lo mismo: no puesta. */
function readVar(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/**
 * El destino de esta ejecución, según `BASE_URL`:
 *  - Sin ella, la app local de siempre: Playwright la construye y la arranca.
 *  - Con ella, esa URL, y no se arranca nada. Si su host no es local (una preview), no se
 *    guarda traza ni vídeo: una traza lleva la cookie de sesión de esa ejecución y no debe
 *    acabar en un artefacto. Con un host local todo queda como siempre.
 *
 * `VERCEL_AUTOMATION_BYPASS_SECRET`, si está puesto, viaja como cabecera para atravesar la
 * protección de una preview. Su valor no se escribe en ningún mensaje ni log.
 */
export function readE2eTarget(env: Env): E2eTarget {
  const configured = readVar(env, "BASE_URL");
  const baseURL = configured ?? LOCAL_BASE_URL;

  if (configured !== null) {
    const isHttp = URL.canParse(configured) && /^https?:$/.test(new URL(configured).protocol);
    if (!isHttp) {
      const failure = new Error(
        "BASE_URL no es una URL http(s) válida. Escríbela entera, con el protocolo " +
          "(por ejemplo, https://mi-preview.vercel.app), o quítala para probar la app local.",
      );
      // Playwright imprime la pila entera de un error al cargar la configuración, y aquí
      // apuntaría a esta línea, no a la causa, que ya va en el mensaje.
      failure.stack = `${failure.name}: ${failure.message}`;
      throw failure;
    }
  }

  // Mismo criterio de host que para el Supabase local: localhost, 127.0.0.1 o [::1].
  const remote = configured !== null && !isLocalSupabaseUrl(configured);

  const bypass = readVar(env, "VERCEL_AUTOMATION_BYPASS_SECRET");
  const use: E2eUse = {
    baseURL,
    trace: remote ? "off" : "retain-on-failure",
    ...(remote ? { video: "off" as const } : {}),
    ...(bypass ? { extraHTTPHeaders: { [BYPASS_HEADER]: bypass } } : {}),
  };

  return { baseURL, remote, startServer: configured === null, use };
}

/**
 * ¿Pueden los tests hablar con el Supabase de la app? Devuelve el motivo si no, o `null`.
 *
 * Los tests piden sus códigos de acceso con la clave de servicio del runner
 * (`NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, de la shell o de `.env.local`).
 * Contra una app desplegada, esos códigos solo valen si salen del mismo Supabase que usa
 * ella. Un Supabase local (o ninguno) del lado del runner, con una app remota del otro, no
 * puede ser: los códigos serían de otro proyecto y todos los logins fallarían, uno a uno.
 *
 * Con una app local (con o sin `BASE_URL`) no hay nada que comprobar aquí: sigue valiendo
 * lo de siempre, y si el Supabase falta ya lo dice `readSupabaseEnv`.
 */
export function checkRunnerSupabase(
  target: E2eTarget,
  supabaseUrl: string | undefined,
): string | null {
  if (!target.remote) return null;

  const url = supabaseUrl?.trim() ?? "";
  let reason: string | null = null;
  if (url === "") {
    reason = "falta NEXT_PUBLIC_SUPABASE_URL en el entorno del runner";
  } else if (!URL.canParse(url)) {
    reason = "NEXT_PUBLIC_SUPABASE_URL del runner no se puede interpretar como URL";
  } else if (isLocalSupabaseUrl(url)) {
    reason = `NEXT_PUBLIC_SUPABASE_URL del runner apunta a ${new URL(url).host}, un Supabase local`;
  }
  if (reason === null) return null;

  return (
    `BASE_URL apunta a ${new URL(target.baseURL).host}, pero ${reason}. ` +
    "Los tests generan los códigos de acceso con la clave de servicio del runner, y tienen que " +
    "ser del mismo Supabase que usa la app desplegada. Pasa NEXT_PUBLIC_SUPABASE_URL y " +
    "SUPABASE_SERVICE_ROLE_KEY del proyecto remoto por la shell (lo que esté en la shell manda " +
    "sobre `.env.local`) o quita BASE_URL para probar la app local."
  );
}
