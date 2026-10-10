"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { safeHref } from "@/lib/safe-href";
import { remainingMs } from "@/modules/live/reducer";
import type { LiveSession } from "@/modules/live/types";
import { useLive } from "@/modules/live/use-live";
import { useWakeLock } from "@/modules/live/use-wake-lock";
import { itemsLabel, minutesLabel } from "@/modules/practice/format";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CourtDiagram } from "@/ui/court-diagram";
import { CTAButton } from "@/ui/cta-button";
import { CheckIcon, CloseIcon, VideoIcon } from "@/ui/icons";
import { LiveControls } from "@/ui/live-controls";
import { Timer } from "@/ui/timer";

const SYNC_LABELS: Record<string, string> = {
  "saved-local": "Guardado en el móvil",
  saved: "Guardado",
  offline: "Sin conexión: se enviará al volver",
  idle: "",
};

type LiveScreenProps = { session: LiveSession; clubSlug: string };

const noopSubscribe = () => () => {};

// La pantalla entera, centrada y sin navegación inferior. `dvh`: en el móvil la barra del
// navegador no debe tapar los controles.
const SCREEN = "mx-auto flex min-h-dvh w-full max-w-(--content-max) flex-col bg-bg";
const CENTERED = `${SCREEN} items-center justify-center gap-(--space-4) px-(--space-4) text-center`;
const LABEL = "text-label text-ink-2 uppercase";
const TITLE = "font-display text-display-m wrap-break-word uppercase";

// Live depende del dispositivo (localStorage, reloj, wake lock): solo se pinta en el cliente
// para que el HTML del servidor nunca choque con el estado guardado al hidratar.
export function LiveScreen(props: LiveScreenProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return null;
  return <LiveScreenContent {...props} />;
}

/**
 * El entrenamiento en directo (design/components/Timer): el ejercicio en curso, su cronómetro,
 * su pizarra, sus puntos clave y los controles al alcance del pulgar.
 *
 * Tres caras según el estado (`useLive`, que al abrir reconcilia lo del dispositivo con lo que
 * sabe el servidor): sin iniciar, la portada con «Iniciar»; en curso, la pantalla de directo;
 * terminada (en este dispositivo, quizá aún sin enviar), el aviso con la vuelta a la ficha.
 * «Salir» no pregunta: el progreso ya está guardado y la ficha ofrece «Continuar».
 */
function LiveScreenContent({ session, clubSlug }: LiveScreenProps) {
  const router = useRouter();
  const { state, now, syncStatus, dispatch, finish } = useLive(session);
  const { supported: wakeLockSupported } = useWakeLock(state.startedAt !== null && state.finishedAt === null);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const detailHref = `/c/${clubSlug}/train/${session.eventId}`;
  const total = session.items.length;
  const item = session.items[state.index];
  const syncLabel = SYNC_LABELS[syncStatus];

  if (!item) return null;

  if (state.finishedAt !== null) {
    return (
      <div className={CENTERED}>
        <h1 className={TITLE}>Entrenamiento terminado</h1>
        <p className="text-body text-ink-2" aria-live="polite">
          {syncStatus === "offline" ? "Sin conexión: el resumen se enviará al volver." : "Ya está en el histórico."}
        </p>
        <CTAButton variant="primary" block href={detailHref}>
          Ver la sesión
        </CTAButton>
      </div>
    );
  }

  if (state.startedAt === null) {
    const plannedMinutes = session.items.reduce((sum, each) => sum + each.minutes, 0);

    return (
      <div className={CENTERED}>
        <p className={LABEL}>Entrenamiento</p>
        <h1 className={TITLE}>{session.title}</h1>
        <p className="text-body text-ink-2">{`${itemsLabel(total)} · ${minutesLabel(plannedMinutes)}`}</p>
        <CTAButton variant="primary" size="live" block onClick={() => dispatch({ type: "start" })}>
          Iniciar
        </CTAButton>
        <CTAButton variant="ghost" href={detailHref}>
          Volver a la sesión
        </CTAButton>
        {!wakeLockSupported ? (
          <p className="text-body-s text-ink-3">Este navegador puede apagar la pantalla</p>
        ) : null}
      </div>
    );
  }

  const isLast = state.index === total - 1;
  const next = session.items[state.index + 1];
  const remaining = remainingMs(state, session, now);
  // La barra cuenta el ejercicio en curso: en el último está llena.
  const progress = ((state.index + 1) / total) * 100;
  const videoHref = item.videoUrl ? safeHref(item.videoUrl) : null;

  async function handleFinish() {
    setFinishing(true);
    // A la ficha solo cuando el fin está registrado: si no, aún ofrecería «Continuar».
    await finish();
    router.push(detailHref);
  }

  return (
    <section className={SCREEN} aria-label="Entrenamiento en directo">
      <div className="flex items-center justify-between py-(--space-2) pr-(--space-4) pl-(--space-2)">
        <Link
          href={detailHref}
          prefetch={false}
          aria-label="Salir"
          className="flex size-(--target-min) items-center justify-center rounded-pill text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <CloseIcon />
        </Link>
        <span className={`${LABEL} inline-flex items-center gap-(--space-2)`}>
          <span aria-hidden="true" className="size-2 rounded-pill bg-danger" />
          En directo
        </span>
        <span className={`${LABEL} tabular-nums`}>{`${state.index + 1} / ${total}`}</span>
      </div>

      <div aria-hidden="true" className="mx-(--space-4) h-1 overflow-hidden rounded-xs bg-surface-2">
        <span className="block h-full bg-brand-accent" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-1 flex-col items-center gap-(--space-2) px-(--space-4) pt-(--space-6) pb-(--space-4) text-center">
        {item.phase ? <p className={LABEL}>{item.phase}</p> : null}
        <h1 className={TITLE}>{item.title}</h1>

        <Timer remainingMs={remaining} paused={state.pausedAt !== null} overtime={remaining < 0} />

        <CourtDiagram src={item.diagramUrl} alt={`Diagrama: ${item.title}`} />

        {videoHref ? (
          <CTAButton
            variant="ghost"
            href={videoHref}
            target="_blank"
            rel="noopener noreferrer"
            icon={<VideoIcon />}
          >
            Vídeo
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </CTAButton>
        ) : null}

        {item.keyPoints.length > 0 ? (
          <ul role="list" className="mt-(--space-2) flex w-full flex-col gap-(--space-2) text-left">
            {item.keyPoints.map((point, index) => (
              <li key={`${index}-${point}`} className="flex items-start gap-(--space-3) text-body-l">
                <CheckIcon className="mt-0.5 text-brand-accent" />
                <span className="min-w-0 wrap-break-word">{point}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {item.standards.length > 0 ? (
          <ul role="list" className="mt-(--space-2) flex w-full flex-col gap-(--space-1) text-left">
            {item.standards.map((standard) => (
              <li key={standard.number} className="text-body-s text-ink-2">
                {`Standard ${standard.number}: ${standard.title}`}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-(--space-3) rounded-t-xl bg-surface-1 px-(--space-4) pt-(--space-4) pb-[max(var(--space-4),env(safe-area-inset-bottom))] shadow-sheet">
        <LiveControls
          onPrevious={() => dispatch({ type: "previous" })}
          onTogglePause={() => dispatch({ type: state.pausedAt !== null ? "resume" : "pause" })}
          onNext={() => (isLast ? setConfirmingFinish(true) : dispatch({ type: "next" }))}
          paused={state.pausedAt !== null}
          isFirst={state.index === 0}
          isLast={isLast}
        />
        <p className="text-center text-body-s text-ink-2">
          {next ? (
            <>
              Siguiente: <b className="font-semibold text-ink">{next.title}</b>
              {` · ${minutesLabel(next.minutes)}`}
            </>
          ) : (
            "Último ejercicio"
          )}
        </p>
        {syncLabel ? (
          <p className="text-center text-body-s text-ink-3" aria-live="polite">
            {syncLabel}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmingFinish}
        onOpenChange={setConfirmingFinish}
        title="¿Terminar el entrenamiento?"
        body="La sesión pasa al histórico con los minutos de cada ejercicio. No se puede deshacer."
        confirmLabel="Terminar"
        cancelLabel="Seguir entrenando"
        pending={finishing}
        onConfirm={handleFinish}
      />
    </section>
  );
}
