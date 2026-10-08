"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LiveAction, LiveSession, LiveState } from "./types";
import { liveReducer, remainingMs, toProgressPayload } from "./reducer";
import { loadLiveState, saveLiveState } from "./storage";
import { syncLiveProgress } from "./sync";

type SyncStatus = "saved-local" | "saved" | "offline" | "idle";

function initialState(session: LiveSession): LiveState {
  return (
    loadLiveState(session.eventId) ?? {
      version: 1,
      eventId: session.eventId,
      index: 0,
      startedAt: null,
      itemStartedAt: null,
      pausedAt: null,
      pausedMs: 0,
      progress: {},
      finishedAt: null,
    }
  );
}

export function useLive(session: LiveSession) {
  const [state, rawDispatch] = useReducer(
    (s: LiveState, action: LiveAction) => liveReducer(s, action, Date.now(), session),
    session,
    initialState,
  );
  const [now, setNow] = useState(() => Date.now());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const rafRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Repintado cada 250 ms
  useEffect(() => {
    rafRef.current = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(rafRef.current);
  }, []);

  // Guardar en localStorage y sincronizar al cambiar el estado
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    saveLiveState(state);
    setSyncStatus("saved-local");
    const payload = {
      ...toProgressPayload(state, session),
      clubSlug: session.clubSlug,
      eventId: session.eventId,
    };
    syncLiveProgress(payload, {
      fetch: globalThis.fetch,
      now: Date.now,
    })
      .then(() => setSyncStatus("saved"))
      .catch(() => setSyncStatus("offline"));
  }, [state, session]);

  const dispatch = useCallback(
    (action: LiveAction) => rawDispatch(action),
    [],
  );

  return {
    state,
    now,
    syncStatus,
    dispatch,
    remaining: remainingMs(state, session, now),
  };
}
