import type { LiveProgressInput } from "./schema";

const INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

type SyncOptions = {
  fetch: typeof globalThis.fetch;
  now: () => number;
  wait?: (ms: number) => Promise<void>;
  /** Cada fallo de red, antes de esperar al siguiente intento. */
  onRetry?: () => void;
  /** Abortado cuando un envío más reciente lo reemplaza: deja de reintentar. */
  signal?: AbortSignal;
};

const PERMANENT_ERRORS = new Set([401, 403, 404, 409, 422]);

export async function syncLiveProgress(
  payload: LiveProgressInput,
  { fetch, now: _now, wait = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry, signal }: SyncOptions,
): Promise<void> {
  let delay = INITIAL_DELAY_MS;

  while (!signal?.aborted) {
    let response: { ok: boolean; status: number };
    try {
      response = await fetch("/api/live-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      onRetry?.();
      await wait(delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
      continue;
    }

    if (response.ok) return;

    if (PERMANENT_ERRORS.has(response.status)) return;

    // 5xx → reintento con espera exponencial
    await wait(delay);
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }
}
