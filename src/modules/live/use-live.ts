"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LiveAction, LiveSession, LiveState } from "./types";
import { reconcile, type Reconciled } from "./reconcile";
import { liveReducer, remainingMs, toProgressPayload } from "./reducer";
import { loadLiveState, saveLiveState } from "./storage";
import { syncLiveProgress, trackLiveSync } from "./sync";

/** Qué ha sido del fin de la sesión cuando `finish` deja de esperar. */
export type FinishResult = "saved" | "pending" | "failed";

/** `failed`: el servidor rechazó el envío. Lo cronometrado sigue en el dispositivo, sin guardar. */
type SyncStatus = "saved-local" | "saved" | "offline" | "failed" | "idle";

export function useLive(session: LiveSession) {
  // El estado con el que se abre: lo del dispositivo frente a lo que trae la página.
  const [initial] = useState<Reconciled>(() => reconcile(session, loadLiveState(session.eventId), Date.now()));
  const [state, rawDispatch] = useReducer(
    (s: LiveState, action: LiveAction) => liveReducer(s, action, Date.now(), session),
    initial.state,
  );
  const [now, setNow] = useState(() => Date.now());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const rafRef = useRef<ReturnType<typeof setInterval>>(undefined);
  // La copia de la sesión que devolvió el último envío que salió bien.
  const serverStamp = useRef<string | null>(initial.serverUpdatedAt);
  // Quien espera a saber qué ha sido del fin (guardado, pendiente sin red o rechazado) para seguir.
  const finishWaiterRef = useRef<((result: FinishResult) => void) | null>(null);

  // Repintado cada 250 ms
  useEffect(() => {
    rafRef.current = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(rafRef.current);
  }, []);

  useEffect(() => {
    // Antes de «Iniciar» no hay nada que guardar ni que enviar: abrir la pantalla no marca la
    // sesión como empezada ni mueve su copia.
    if (state.startedAt === null) return;

    // Abrir un directo en curso tampoco escribe: mientras nadie toque nada, el estado es el
    // que el servidor ya tiene. Solo se envía al abrir lo que el dispositivo tenía sin enviar.
    if (state === initial.state && initial.source !== "device-unsent") {
      // Lo que vino del servidor se guarda como enviado, con su copia: así, al volver a abrir,
      // se sabe si la página que llegue es más nueva o más vieja que esto.
      if (initial.source === "server") {
        saveLiveState(state, { synced: true, serverUpdatedAt: initial.serverUpdatedAt });
      }
      return;
    }

    saveLiveState(state, { synced: false, serverUpdatedAt: serverStamp.current });
    const payload = {
      ...toProgressPayload(state, session),
      clubSlug: session.clubSlug,
      eventId: session.eventId,
    };
    // Cada envío lleva el progreso completo: el más reciente reemplaza a los anteriores. No se
    // cancela al desmontar: el de «terminar» tiene que llegar aunque se salga de la pantalla.
    const controller = trackLiveSync(session.eventId);
    const current = () => !controller.signal.aborted;
    const waiter = state.finishedAt !== null ? finishWaiterRef.current : null;
    if (waiter) finishWaiterRef.current = null;
    // Sin red no se retiene a nadie: el envío sigue reintentándose aunque se salga de Live.
    const release = (result: FinishResult) => waiter?.(result);
    Promise.resolve()
      .then(() => {
        setSyncStatus("saved-local");
        return syncLiveProgress(payload, {
          fetch: globalThis.fetch,
          now: Date.now,
          signal: controller.signal,
          onRetry: () => {
            release("pending");
            if (current()) setSyncStatus("offline");
          },
        });
      })
      .then((outcome) => {
        release(outcome.status === "saved" ? "saved" : outcome.status === "rejected" ? "failed" : "pending");
        if (outcome.status === "aborted" || !current()) return;
        if (outcome.status === "rejected") {
          // El servidor dijo que no: no está guardado, y no se marca como si lo estuviera.
          setSyncStatus("failed");
          return;
        }
        // Este mismo estado ya está en el servidor, en esta copia de la sesión.
        serverStamp.current = outcome.updatedAt ?? serverStamp.current;
        saveLiveState(state, { synced: true, serverUpdatedAt: serverStamp.current });
        setSyncStatus("saved");
      })
      .catch(() => {
        release("pending");
        if (current()) setSyncStatus("offline");
      });
  }, [state, session, initial]);

  const dispatch = useCallback(
    (action: LiveAction) => rawDispatch(action),
    [],
  );

  /** Termina y dice qué ha sido del fin: guardado, pendiente (sin red, se reintenta) o rechazado. */
  const finish = useCallback(
    () =>
      new Promise<FinishResult>((resolve) => {
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
