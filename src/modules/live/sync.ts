import type { LiveProgressInput } from "./schema";

const INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

type SyncOptions = {
  fetch: typeof globalThis.fetch;
  now: () => number;
  wait?: (ms: number) => Promise<void>;
  /** Cada fallo de red, antes de esperar al siguiente intento. */
  onRetry?: () => void;
  /** Abortado cuando un envío más reciente lo reemplaza, o cuando se reinicia la sesión. */
  signal?: AbortSignal;
};

/**
 * Cómo acabó un envío:
 *  - `saved`: el servidor lo tiene. `updatedAt` es la copia con la que queda la sesión, tal
 *    como la devuelve la función (texto; no pasa por `Date`), o `null` si no la dijo.
 *  - `rejected`: el servidor contestó que no (sin sesión, sin permiso, sesión cerrada, entrada
 *    no válida). Reintentar no lo arregla, y lo enviado NO está guardado.
 *  - `aborted`: alguien lo canceló antes de saber nada.
 */
export type SyncOutcome =
  | { status: "saved"; updatedAt: string | null }
  | { status: "rejected"; httpStatus: number }
  | { status: "aborted" };

const PERMANENT_ERRORS = new Set([401, 403, 404, 409, 422]);

/** La copia de la sesión que devuelve `/api/live-progress`, si la respuesta la trae. */
async function updatedAtOf(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const value = typeof body === "object" && body !== null ? (body as { updated_at?: unknown }).updated_at : null;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Envía el progreso del directo y dice cómo acabó. Sin red o con un 5xx reintenta con espera
 * exponencial hasta que sale, lo rechazan o lo cancelan: no se rinde, porque en un pabellón la
 * cobertura vuelve. Cancelarlo (`signal`) corta también la petición en vuelo.
 */
export async function syncLiveProgress(
  payload: LiveProgressInput,
  { fetch, now: _now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry, signal }: SyncOptions,
): Promise<SyncOutcome> {
  let delay = INITIAL_DELAY_MS;

  while (!signal?.aborted) {
    let response: Response;
    try {
      response = await fetch("/api/live-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch {
      // Cancelado a mitad: no es un fallo de red.
      if (signal?.aborted) break;
      onRetry?.();
      await wait(delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
      continue;
    }

    if (response.ok) return { status: "saved", updatedAt: await updatedAtOf(response) };

    if (PERMANENT_ERRORS.has(response.status)) return { status: "rejected", httpStatus: response.status };

    // 5xx → reintento con espera exponencial
    await wait(delay);
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }

  return { status: "aborted" };
}

// El envío en curso de cada sesión, a nivel de módulo: sobrevive a salir de la pantalla de
// directo (el de «terminar» tiene que llegar aunque se salga), y así quien reinicia la sesión
// desde su ficha puede cancelarlo antes de que un reintento reviva lo que acaba de borrar.
const inFlight = new Map<string, AbortController>();

/** Registra el envío en curso de una sesión y cancela el anterior: el más reciente lo reemplaza. */
export function trackLiveSync(eventId: string): AbortController {
  inFlight.get(eventId)?.abort();
  const controller = new AbortController();
  inFlight.set(eventId, controller);
  return controller;
}

/** Cancela el envío en curso de una sesión, con sus reintentos. Sin ninguno, no hace nada. */
export function cancelLiveSync(eventId: string): void {
  inFlight.get(eventId)?.abort();
  inFlight.delete(eventId);
}
