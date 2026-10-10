"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LiveAction, LiveSession, LiveState } from "./types";
import { reconcile } from "./reconcile";
import { liveReducer, remainingMs, toProgressPayload } from "./reducer";
import { loadLiveState, saveLiveState } from "./storage";
import { syncLiveProgress } from "./sync";

type SyncStatus = "saved-local" | "saved" | "offline" | "idle";

/** El estado con el que se abre: lo del dispositivo frente a lo que sabe el servidor. */
function initialState(session: LiveSession): LiveState {
  return reconcile(session, loadLiveState(session.eventId), Date.now());
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
  // El envío en curso. No se aborta al desmontar: el de «terminar» tiene que llegar aunque
  // se salga de la pantalla.
  const syncRef = useRef<AbortController | null>(null);
  // Quien espera a que el fin llegue al servidor (o a saber que no hay red) para seguir.
  const finishWaiterRef = useRef<(() => void) | null>(null);

  // Repintado cada 250 ms
  useEffect(() => {
    rafRef.current = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(rafRef.current);
  }, []);

  useEffect(() => {
    // Antes de «Iniciar» no hay nada que guardar ni que enviar: abrir la pantalla no marca la
    // sesión como empezada ni mueve su copia.
    if (state.startedAt === null) return;

    saveLiveState(state, false);
    const payload = {
      ...toProgressPayload(state, session),
      clubSlug: session.clubSlug,
      eventId: session.eventId,
    };
    // Cada envío lleva el progreso completo: el más reciente reemplaza a los anteriores.
    syncRef.current?.abort();
    const controller = new AbortController();
    syncRef.current = controller;
    const current = () => !controller.signal.aborted;
    const waiter = state.finishedAt !== null ? finishWaiterRef.current : null;
    if (waiter) finishWaiterRef.current = null;
    // Sin red no se retiene a nadie: el envío sigue reintentándose aunque se salga de Live.
    const release = () => waiter?.();
    Promise.resolve()
      .then(() => {
        setSyncStatus("saved-local");
        return syncLiveProgress(payload, {
          fetch: globalThis.fetch,
          now: Date.now,
          signal: controller.signal,
          onRetry: () => {
            release();
            if (current()) setSyncStatus("offline");
          },
        });
      })
      .then(() => {
        release();
        if (!current()) return;
        // Este mismo estado ya está en el servidor: al volver a abrir, manda el servidor.
        saveLiveState(state, true);
        setSyncStatus("saved");
      })
      .catch(() => {
        release();
        if (current()) setSyncStatus("offline");
      });
  }, [state, session]);

  const dispatch = useCallback(
    (action: LiveAction) => rawDispatch(action),
    [],
  );

  /** Termina y espera a que el servidor lo registre, o a saber que no hay red. */
  const finish = useCallback(
    () =>
      new Promise<void>((resolve) => {
        finishWaiterRef.current = resolve;
        rawDispatch({ type: "finish" });
      }),
    [],
  );

  return {
    state,
    now,
    syncStatus,
    dispatch,
    finish,
    remaining: remainingMs(state, session, now),
  };
}
