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

/**
 * Con qué estado se abre el directo: lo que guarda el dispositivo frente a lo que sabe el
 * servidor (`session.live`).
 *
 * 1. Si el dispositivo tiene progreso sin enviar, manda el dispositivo: en un pabellón sin
 *    cobertura lo cronometrado solo está ahí.
 * 2. Si no, manda el servidor. Sin empezar: estado nuevo, ejercicio 1, guarde lo que guarde
 *    el dispositivo (un estado viejo no abre una sesión por la mitad). En curso: si el
 *    dispositivo va por el mismo ejercicio se usa su estado, con su tiempo exacto; si no, el
 *    ejercicio del servidor con su tiempo entero y el reloj en marcha.
 *
 * El índice se acota siempre a los ejercicios que la sesión tiene ahora: pueden haberse
 * quitado desde que se guardó. Es pura: `nowMs` llega de fuera.
 */
export function reconcile(session: LiveSession, stored: StoredLive | null, nowMs: number): LiveState {
  const itemCount = session.items.length;
  const local = stored?.state ?? null;
  const localStarted = local !== null && local.startedAt !== null;

  if (stored && localStarted && !stored.synced) {
    return { ...stored.state, index: clampIndex(stored.state.index, itemCount) };
  }

  const { startedAt, position } = session.live;
  if (startedAt === null) return freshState(session.eventId);

  const index = clampIndex(position ?? 0, itemCount);
  if (local && localStarted && local.finishedAt === null && local.index === index) return local;

  const startedMs = Date.parse(startedAt);
  return {
    ...freshState(session.eventId),
    index,
    startedAt: Number.isNaN(startedMs) ? nowMs : startedMs,
    itemStartedAt: nowMs,
    progress: serverProgress(session),
  };
}
