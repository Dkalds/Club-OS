// Contra qué corren los e2e: la app local que arranca Playwright, o una URL ya desplegada
// (`BASE_URL`, por ejemplo la preview de Vercel). Son funciones puras: lo que deciden
// `playwright.config.ts` y `e2e/global-setup.ts` se prueba aquí, en `e2e-target.test.ts`.

import type { PlaywrightTestOptions, PlaywrightWorkerOptions } from "@playwright/test";
import { isLocalSupabaseUrl } from "../seed/guard";

const LOCAL_ORIGIN = "http://localhost";
const DEFAULT_PORT = "3000";

/** Con esta cabecera, Vercel deja pasar una automatización por su protección de despliegues. */
const BYPASS_HEADER = "x-vercel-protection-bypass";

type Env = Record<string, string | undefined>;

/**
 * Lo que `playwright.config.ts` pone en `use`. Sin `extraHTTPHeaders`, a propósito: esa opción
 * envía sus cabeceras a TODOS los orígenes que pide la página (también a los saltos de una
 * redirección a otro dominio), y el secreto del bypass no puede ir a ninguno que no sea la app.
 */
export type E2eUse = Pick<PlaywrightTestOptions, "baseURL"> &
  Partial<Pick<PlaywrightWorkerOptions, "trace" | "video">>;

/** Qué cabecera con qué secreto, y SOLO para las peticiones a qué origen. */
export type E2eBypass = { origin: string; header: string; secret: string };

export type E2eTarget = {
  baseURL: string;
  /** `true` si la app no corre en esta máquina (el host de `baseURL` no es local). */
  remote: boolean;
  /** Playwright construye y arranca la app solo si nadie ha dicho dónde está ya. */
  startServer: boolean;
  use: E2eUse;
  /**
   * El secreto de la protección de despliegues, si hay que enviarlo: solo con una app remota
   * y con `VERCEL_AUTOMATION_BYPASS_SECRET` puesto. Con una app local es siempre `null`,
   * aunque la variable esté en la shell. Lo aplica el fixture de `e2e/helpers/test.ts`.
   */
  bypass: E2eBypass | null;
};

/** Una variable de entorno sin valor y una en blanco son lo mismo: no puesta. */
function readVar(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/**
 * El puerto de la app local: `PORT` si es un número de puerto, o 3000. `next start` lee la
 * misma variable, así que los tests apuntan a donde arranca la app. Sirve para que dos
 * checkouts del repo (worktrees) pasen los e2e a la vez sin reutilizar el servidor del otro.
 */
function localPort(env: Env): string {
  const value = readVar(env, "PORT");
  if (value === null || !/^\d{1,5}$/.test(value)) return DEFAULT_PORT;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? String(port) : DEFAULT_PORT;
}

/**
 * El destino de esta ejecución, según `BASE_URL`:
 *  - Sin ella, la app local de siempre: Playwright la construye y la arranca, en el puerto
 *    3000 o en el de `PORT`.
 *  - Con ella, esa URL, y no se arranca nada. Si su host no es local (una preview), no se
 *    guarda traza ni vídeo: una traza lleva la cookie de sesión de esa ejecución y no debe
 *    acabar en un artefacto. Con un host local todo queda como siempre.
 *
 * `VERCEL_AUTOMATION_BYPASS_SECRET`, si está puesto y la app es remota, queda en `bypass`
 * para atravesar la protección de una preview, solo hacia el origen de `BASE_URL`. Su valor
 * no se escribe en ningún mensaje ni log.
 */
export function readE2eTarget(env: Env): E2eTarget {
  const configured = readVar(env, "BASE_URL");
  const baseURL = configured ?? `${LOCAL_ORIGIN}:${localPort(env)}`;

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

  const use: E2eUse = {
    baseURL,
    trace: remote ? "off" : "retain-on-failure",
    ...(remote ? { video: "off" as const } : {}),
  };

  const secret = readVar(env, "VERCEL_AUTOMATION_BYPASS_SECRET");
  const bypass: E2eBypass | null =
    remote && secret
      ? { origin: new URL(baseURL).origin, header: BYPASS_HEADER, secret }
      : null;

  return { baseURL, remote, startServer: configured === null, use, bypass };
}

/** Lo que usa `bypassHandler` de una ruta de Playwright (`Route` lo cumple). */
type RouteLike = {
  request(): { headers(): Record<string, string> };
  fallback(overrides: { headers: Record<string, string> }): Promise<void>;
};

/**
 * El manejador de ruta que añade el secreto a una petición. Se registra solo para el origen
 * de `bypass.origin` (ver el fixture `protectionBypass` de `e2e/helpers/test.ts`): ninguna
 * petición a otro origen lo lleva (scripts de terceros, analítica, CDN).
 *
 * - `fallback` y no `continue`: la petición sigue su camino y otras rutas del test se aplican
 *   también. Una ruta de un test que se registre con `page.route` va antes que esta y tiene
 *   que terminar con `route.fallback()`, no con `route.continue()`, para que el secreto llegue.
 * - Las cabeceras se reenvían enteras: al cambiarlas, Playwright sustituye el conjunto
 *   completo. `headers()` no incluye las cookies; las añade el navegador después.
 * - Redirecciones, comprobado con Chromium: Playwright solo pasa por la ruta la primera
 *   petición, y las cabeceras cambiadas siguen a la petición en sus redirecciones, también
 *   a otro dominio (la documentación de Playwright dice lo contrario). Las redirecciones al
 *   propio origen (/ → /select-club → /c/club) lo necesitan: cada salto es una petición a la
 *   preview y la protección la comprueba. A cambio, si el secreto es incorrecto y la protección
 *   redirige a otro dominio, esa petición lo lleva también. Con un secreto válido no debería haberla.
 */
export function bypassHandler(bypass: E2eBypass): (route: RouteLike) => Promise<void> {
  return (route) =>
    route.fallback({
      headers: { ...route.request().headers(), [bypass.header]: bypass.secret },
    });
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
