"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LiveSession } from "@/modules/live/types";
import { useLive } from "@/modules/live/use-live";
import { useWakeLock } from "@/modules/live/use-wake-lock";
import { remainingMs } from "@/modules/live/reducer";
import { CourtDiagram } from "@/ui/court-diagram";
import { Timer } from "@/ui/timer";
import { LiveControls } from "@/ui/live-controls";

const SYNC_LABELS: Record<string, string> = {
  "saved-local": "Guardado en el móvil",
  saved: "Guardado",
  offline: "Sin conexión: se enviará al volver",
  idle: "",
};

export function LiveScreen({ session, clubSlug }: { session: LiveSession; clubSlug: string }) {
  const router = useRouter();
  const { state, now, syncStatus, dispatch } = useLive(session);
  const { supported: wakeLockSupported } = useWakeLock(state.startedAt !== null && state.finishedAt === null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const item = session.items[state.index];
  const total = session.items.length;
  const progress = total > 0 ? ((state.index + (state.startedAt !== null ? 1 : 0)) / total) * 100 : 0;
  const remaining = remainingMs(state, session, now);
  const overtime = remaining < 0;

  if (!item) return null;

  function handleNext() {
    if (state.index === session.items.length - 1) {
      setShowFinishConfirm(true);
    } else {
      dispatch({ type: "next" });
    }
  }

  function handleFinish() {
    dispatch({ type: "finish" });
    setShowFinishConfirm(false);
    router.push(`/c/${clubSlug}/train/${session.eventId}`);
  }

  if (state.startedAt === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-space-6 p-space-4">
        <h1 className="text-display-m text-center">{session.title}</h1>
        <p className="text-body-s text-ink-2">{total} ejercicios</p>
        <button
          className="cos-btn cos-btn--primary"
          onClick={() => dispatch({ type: "start" })}
        >
          Iniciar
        </button>
        {!wakeLockSupported && (
          <p className="text-body-s text-ink-3">Este navegador puede apagar la pantalla</p>
        )}
      </div>
    );
  }

  return (
    <section className="cos-live flex h-screen flex-col" aria-label="Entrenamiento en directo">
      {/* Cabecera */}
      <div className="cos-live__top flex items-center justify-between p-space-3">
        <button
          className="cos-iconbtn"
          aria-label="Salir"
          onClick={() => router.push(`/c/${clubSlug}/train/${session.eventId}`)}
        >
          <svg className="cos-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <span className="cos-label flex items-center gap-space-1">
          <span
            className="inline-block size-2 rounded-full bg-danger"
            aria-hidden="true"
          />
          En directo
        </span>
        <span className="cos-label tabular-nums">
          {state.index + 1} / {total}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="cos-live__progress h-1 bg-surface-2" aria-hidden="true">
        <span className="block h-full bg-brand-accent" style={{ width: `${progress}%` }} />
      </div>

      {/* Cuerpo */}
      <div className="cos-live__body flex-1 overflow-y-auto p-space-4 pb-[calc(72px+env(safe-area-inset-bottom)+var(--space-4))]">
        {item.phase && <p className="cos-label text-ink-2">{item.phase}</p>}
        <h1 className="text-display-m">{item.title}</h1>

        <Timer remainingMs={remaining} paused={state.pausedAt !== null} overtime={overtime} />

        <CourtDiagram src={item.diagramUrl} alt={`Diagrama: ${item.title}`} />

        {item.keyPoints.length > 0 && (
          <ul className="cos-live__points mt-space-4 flex flex-col gap-space-2">
            {item.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-space-2">
                <svg className="cos-ico mt-[2px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}

        {item.standards.length > 0 && (
          <div className="mt-space-4">
            {item.standards.map((std) => (
              <p key={std.number} className="text-body-s text-ink-2">
                Standard {std.number}: {std.title}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Estado de sincronización */}
      {syncStatus !== "idle" && (
        <p className="px-space-4 text-body-s text-ink-2">{SYNC_LABELS[syncStatus]}</p>
      )}

      {/* Controles fijos */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface-0 p-space-3 pb-[max(var(--space-3),env(safe-area-inset-bottom))]">
        <LiveControls
          onPrevious={() => dispatch({ type: "previous" })}
          onTogglePause={() => dispatch({ type: state.pausedAt !== null ? "resume" : "pause" })}
          onNext={handleNext}
          paused={state.pausedAt !== null}
          isFirst={state.index === 0}
          isLast={state.index === session.items.length - 1}
        />
      </div>

      {/* Confirmación de fin */}
      {showFinishConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Terminar entrenamiento"
          className="fixed inset-0 flex items-center justify-center bg-bg/80 p-space-4"
        >
          <div className="w-full max-w-sm rounded-lg bg-surface-1 p-space-4 shadow-sheet">
            <p className="text-body-m mb-space-4">¿Terminar el entrenamiento?</p>
            <div className="flex gap-space-3">
              <button className="cos-btn cos-btn--secondary flex-1" onClick={() => setShowFinishConfirm(false)}>
                Cancelar
              </button>
              <button className="cos-btn cos-btn--primary flex-1" onClick={handleFinish}>
                Terminar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
