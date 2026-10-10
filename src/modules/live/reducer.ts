import type { LiveAction, LiveSession, LiveState } from "./types";
import type { LiveProgressInput } from "./schema";

/** Los topes del servidor (`record_live_progress` y `practice_plans.live_position`). */
const MAX_ITEM_MINUTES = 180;
const MAX_POSITION = 29;

function itemMs(minutes: number): number {
  return minutes * 60_000;
}

export function liveReducer(
  state: LiveState,
  action: LiveAction,
  nowMs: number,
  session: LiveSession,
): LiveState {
  if (state.finishedAt !== null) return state;

  switch (action.type) {
    case "start": {
      if (state.startedAt !== null) return state;
      return { ...state, startedAt: nowMs, itemStartedAt: nowMs };
    }

    case "pause": {
      if (state.pausedAt !== null || state.startedAt === null) return state;
      return { ...state, pausedAt: nowMs };
    }

    case "resume": {
      if (state.pausedAt === null) return state;
      const addedPause = nowMs - state.pausedAt;
      return { ...state, pausedAt: null, pausedMs: state.pausedMs + addedPause };
    }

    case "next": {
      if (state.startedAt === null || state.itemStartedAt === null) return state;
      if (state.index >= session.items.length - 1) return state;
      const currentItem = session.items[state.index];
      if (!currentItem) return state;
      const pauseOffset = state.pausedAt !== null ? nowMs - state.pausedAt : 0;
      const actualMs = Math.max(0, nowMs - state.itemStartedAt - state.pausedMs - pauseOffset);
      const completed = actualMs > 0;
      return {
        ...state,
        index: state.index + 1,
        itemStartedAt: nowMs,
        pausedMs: 0,
        pausedAt: null,
        progress: {
          ...state.progress,
          [currentItem.id]: { completed, actualMs },
        },
      };
    }

    case "previous": {
      if (state.index === 0) return state;
      return { ...state, index: state.index - 1 };
    }

    case "finish": {
      // Terminar cierra también el ejercicio en curso: en el último no hay «siguiente» que lo
      // registre, y sin esto la sesión acabaría con su último ejercicio «sin hacer».
      const currentItem = session.items[state.index];
      if (state.startedAt === null || state.itemStartedAt === null || !currentItem) {
        return { ...state, finishedAt: nowMs };
      }
      const pauseOffset = state.pausedAt !== null ? nowMs - state.pausedAt : 0;
      const actualMs = Math.max(0, nowMs - state.itemStartedAt - state.pausedMs - pauseOffset);
      return {
        ...state,
        finishedAt: nowMs,
        progress: { ...state.progress, [currentItem.id]: { completed: actualMs > 0, actualMs } },
      };
    }
  }
}

export function remainingMs(state: LiveState, session: LiveSession, nowMs: number): number {
  if (state.startedAt === null || state.itemStartedAt === null) {
    const item = session.items[state.index];
    return item ? itemMs(item.minutes) : 0;
  }
  const item = session.items[state.index];
  if (!item) return 0;
  const pauseOffset = state.pausedAt !== null ? nowMs - state.pausedAt : 0;
  const spent = nowMs - state.itemStartedAt - state.pausedMs - pauseOffset;
  return itemMs(item.minutes) - spent;
}

export function elapsedMs(state: LiveState, nowMs: number): number {
  if (state.startedAt === null) return 0;
  const pauseOffset = state.pausedAt !== null ? nowMs - state.pausedAt : 0;
  return nowMs - state.startedAt - state.pausedMs - pauseOffset;
}

export function toProgressPayload(
  state: LiveState,
  session: LiveSession,
): Omit<LiveProgressInput, "clubSlug" | "eventId"> {
  const items = session.items.map((item) => {
    const prog = state.progress[item.id];
    if (!prog) {
      return { id: item.id, completed: false, actualMinutes: null };
    }
    // Un móvil olvidado en marcha no deja el envío sin poder guardarse: el servidor admite
    // hasta `MAX_ITEM_MINUTES` por ejercicio.
    const minutes = Math.min(Math.round(prog.actualMs / 60_000), MAX_ITEM_MINUTES);
    return {
      id: item.id,
      // D5: 0 min → completed = false
      completed: prog.completed && minutes > 0,
      actualMinutes: minutes,
    };
  });
  return {
    items,
    finished: state.finishedAt !== null,
    // El estado del directo que guarda el servidor: sin empezar no se manda ninguno (C15).
    ...(state.startedAt !== null
      ? { startedAt: new Date(state.startedAt).toISOString(), position: Math.min(state.index, MAX_POSITION) }
      : {}),
  };
}
