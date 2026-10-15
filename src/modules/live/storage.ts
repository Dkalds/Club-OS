import type { LiveState, StoredLive } from "./types";

/** La versión de lo guardado. Un estado de otra versión se descarta al leerlo. */
const STORAGE_VERSION = 2;

export function LIVE_STATE_KEY(eventId: string): string {
  return `clubos:live:${eventId}`;
}

/**
 * Guarda el estado del directo en el dispositivo. `synced` dice si ese mismo estado ya llegó
 * al servidor, y `serverUpdatedAt`, la copia de la sesión que devolvió el último envío que
 * salió bien: con los dos, al volver a abrir se sabe quién manda (`reconcile`).
 */
export function saveLiveState(
  state: LiveState,
  { synced, serverUpdatedAt }: { synced: boolean; serverUpdatedAt: string | null },
): void {
  try {
    localStorage.setItem(
      LIVE_STATE_KEY(state.eventId),
      JSON.stringify({ version: STORAGE_VERSION, synced, serverUpdatedAt, state }),
    );
  } catch {
    // localStorage no disponible o lleno: Live sigue en memoria
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Lo guardado para este evento, o `null` si no hay nada, no se puede leer, es de otra versión
 * (los estados de la versión 1 no sabían si se habían enviado) o es de otro evento.
 */
export function loadLiveState(eventId: string): StoredLive | null {
  try {
    const raw = localStorage.getItem(LIVE_STATE_KEY(eventId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null;

    const { state, synced, serverUpdatedAt } = parsed;
    if (!isRecord(state) || state.version !== STORAGE_VERSION || state.eventId !== eventId) return null;

    return {
      state: state as LiveState,
      synced: synced === true,
      serverUpdatedAt: typeof serverUpdatedAt === "string" ? serverUpdatedAt : null,
    };
  } catch {
    return null;
  }
}

/** Borra lo guardado para este evento («Empezar de nuevo»). */
export function clearLiveState(eventId: string): void {
  try {
    localStorage.removeItem(LIVE_STATE_KEY(eventId));
  } catch {
    // localStorage no disponible
  }
}
