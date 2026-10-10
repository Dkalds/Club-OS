import type { ItemProgress, LiveSession, LiveState, StoredLive } from "./types";

const MS_PER_MINUTE = 60_000;

/** Una sesión sin empezar, en el primer ejercicio. */
export function freshState(eventId: string): LiveState {
  return {
    version: 2,
    eventId,
    index: 0,
    startedAt: null,
    itemStartedAt: null,
    pausedAt: null,
    pausedMs: 0,
    progress: {},
    finishedAt: null,
  };
}

/**
 * De dónde sale el estado con el que se abre el directo:
 *  - `device-unsent`: del dispositivo, con progreso que el servidor no tiene. Hay que enviarlo.
 *  - `device`: del dispositivo, y el servidor ya lo tiene.
 *  - `server`: de lo que guarda el servidor (otro dispositivo, o este sin nada guardado).
 *  - `fresh`: una sesión sin empezar.
 */
export type LiveSource = "device-unsent" | "device" | "server" | "fresh";

export type Reconciled = {
  state: LiveState;
  source: LiveSource;
  /** La copia de la sesión en el servidor que este estado refleja; `null` si ninguna. */
  serverUpdatedAt: string | null;
};

/** Un índice dentro de la lista de ejercicios que hay ahora; sin ejercicios, 0. */
function clampIndex(index: number, itemCount: number): number {
  return Math.min(Math.max(index, 0), Math.max(itemCount - 1, 0));
}

/** Lo que otro dispositivo ya dejó registrado en el servidor, como progreso local. */
function serverProgress(session: LiveSession): Record<string, ItemProgress> {
  const progress: Record<string, ItemProgress> = {};
  for (const item of session.items) {
    if (item.completed === null || item.actualMinutes === null) continue;
    progress[item.id] = { completed: item.completed, actualMs: item.actualMinutes * MS_PER_MINUTE };
  }
  return progress;
}

const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/** Un `updated_at` como lo da Postgres, en milisegundos del segundo entero y microsegundos aparte. */
function parseStamp(stamp: string): { ms: number; micros: number } | null {
  const match = STAMP.exec(stamp);
  if (!match) return null;
  const ms = Date.parse(`${match[1]}${match[3]}`);
  if (Number.isNaN(ms)) return null;
  return { ms, micros: Number((match[2] ?? "").padEnd(6, "0").slice(0, 6)) };
}

/**
 * Compara dos `updated_at` (texto de Postgres, con microsegundos, que `Date` no conserva):
 * negativo si `a` es anterior, 0 si son el mismo instante, positivo si `a` es posterior. Uno
 * que no se puede leer cuenta como desconocido: `null`.
 */
export function compareStamps(a: string, b: string): number | null {
  if (a === b) return 0;
  const left = parseStamp(a);
  const right = parseStamp(b);
  if (!left || !right) return null;
  return left.ms - right.ms || left.micros - right.micros;
}

/**
 * Con qué estado se abre el directo: lo que guarda el dispositivo frente a lo que trae la
 * página del servidor (`session.live`).
 *
 * 1. Si el dispositivo tiene progreso sin enviar, manda el dispositivo: en un pabellón sin
 *    cobertura lo cronometrado solo está ahí.
 * 2. Si lo suyo ya está enviado, se compara la copia de la sesión que devolvió ese envío
 *    (`stored.serverUpdatedAt`) con la que trae la página (`session.live.updatedAt`):
 *    - la misma, o una ANTERIOR: la página no sabe nada que el dispositivo no sepa. Una
 *      anterior es una página vieja (la caché del service worker con mala cobertura, o el
 *      botón «atrás»): fiarse de ella reabriría por el ejercicio 1 una sesión que va por el
 *      tercero. Manda el dispositivo, con su tiempo exacto.
 *    - una POSTERIOR: algo cambió en el servidor después (otro dispositivo avanzó, alguien
 *      pulsó «Empezar de nuevo», se editó la sesión). Manda el servidor.
 * 3. Sin nada guardado en el dispositivo, manda el servidor.
 *
 * Cuando manda el servidor: sin empezar, estado nuevo en el ejercicio 1; en curso, su
 * ejercicio con el tiempo entero y el reloj en marcha, y lo que ya tenía registrado de los
 * demás.
 *
 * El índice se acota siempre a los ejercicios que la sesión tiene ahora: pueden haberse
 * quitado desde que se guardó. Es pura: `nowMs` llega de fuera.
 */
export function reconcile(session: LiveSession, stored: StoredLive | null, nowMs: number): Reconciled {
  const itemCount = session.items.length;
  const { startedAt, position, updatedAt } = session.live;

  if (stored && stored.state.startedAt !== null) {
    const state = { ...stored.state, index: clampIndex(stored.state.index, itemCount) };

    if (!stored.synced) return { state, source: "device-unsent", serverUpdatedAt: stored.serverUpdatedAt };

    // Sin saber qué copia dejó el último envío, no se puede afirmar que la página sea vieja.
    const order = stored.serverUpdatedAt === null ? null : compareStamps(updatedAt, stored.serverUpdatedAt);
    if (order !== null && order <= 0) return { state, source: "device", serverUpdatedAt: stored.serverUpdatedAt };
  }

  if (startedAt === null) return { state: freshState(session.eventId), source: "fresh", serverUpdatedAt: null };

  const startedMs = Date.parse(startedAt);
  return {
    state: {
      ...freshState(session.eventId),
      index: clampIndex(position ?? 0, itemCount),
      startedAt: Number.isNaN(startedMs) ? nowMs : startedMs,
      itemStartedAt: nowMs,
      progress: serverProgress(session),
    },
    source: "server",
    serverUpdatedAt: updatedAt,
  };
}
