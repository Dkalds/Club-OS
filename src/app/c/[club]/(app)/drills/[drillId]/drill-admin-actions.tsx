"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ACTION_ERROR_COPY, type ActionResult } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { archiveDrill, publishDrill } from "@/modules/drills/actions";
import { BottomSheet } from "@/ui/bottom-sheet";
import { CTAButton } from "@/ui/cta-button";
import { FieldError } from "@/ui/form-field";
import { DRILL_TITLE_ID } from "./title-id";

type Control = "publish" | "archive";

/** Lo que oye quien usa un lector de pantalla cuando cada acción sale bien. */
const DONE_MESSAGE: Record<Control, string> = {
  publish: "Ejercicio publicado.",
  archive: "Ejercicio archivado.",
};

/**
 * Cuánto se espera, tras terminar todo (la acción, el repintado de la ficha y el cierre de la
 * hoja), antes de mover el foco y anunciar el resultado. Es lo que tarda la hoja modal en
 * irse del todo y devolverle al resto de la pantalla su lugar en el árbol de accesibilidad
 * (mientras está abierta lo esconde con `aria-hidden`): un cambio de texto que llega a la vez
 * que el aviso reaparece no se anuncia de forma fiable. Con esta espera, el cambio ocurre con
 * el aviso ya a la vista, y el foco no choca con el que Radix devuelve al cerrar la hoja.
 */
const SETTLE_MS = 100;

/**
 * Los botones de dirección de la ficha de un ejercicio: «Publicar» (un borrador, o un archivado
 * que vuelve) y «Archivar» (con confirmación). Qué se ofrece lo decide la página con
 * `drillPermissions`; aquí solo se muestra u oculta, y lo que protege es la Server Action
 * (`can`) y RLS. Si desde el principio no se puede ni publicar ni archivar, no pinta nada.
 *
 * «Publicar» no pide confirmación (se puede deshacer archivando). «Archivar» abre una hoja que
 * explica qué cambia: el ejercicio deja de salir en la biblioteca, pero las sesiones que ya lo
 * usan lo conservan.
 *
 * Al salir bien, `router.refresh()` repinta la ficha con el estado nuevo (las acciones ya
 * revalidan las rutas), y mientras dura, igual que mientras corre la acción, los botones
 * esperan: un segundo toque no lanza otra. La hoja, que sigue abierta mientras tanto y no se
 * deja cerrar a medias (el resultado llegaría a una pantalla sin hoja), se cierra al terminar,
 * salga como salga.
 *
 * Qué pasa con el foco y con lo que oye un lector de pantalla, cuando todo ha terminado (ver
 * `SETTLE_MS`):
 * - Si ha salido bien, el botón pulsado ya no existe (publicado ya no se publica; archivado ya
 *   no se archiva), y con él se iría el foco a `<body>`. Va al `<h1>` de la ficha
 *   (`DRILL_TITLE_ID`, con `tabIndex={-1}`): es lo único que siempre sigue ahí, dice dónde se
 *   está y, justo debajo, está el aviso de «Archivado» o «Borrador» que acaba de cambiar. La
 *   misma regla para las dos acciones. Y se anuncia el resultado en un `role="status"` que
 *   existe desde el principio, vacío: se rellena con la hoja ya cerrada, porque la hoja modal
 *   esconde la pantalla entera a los lectores de pantalla (`aria-hidden`) y un texto puesto
 *   mientras tanto no se anunciaría. El aviso sigue en el árbol aunque la ficha repintada ya
 *   no deje ningún botón: por eso este componente no se vacía si empezó con alguno.
 * - Si ha fallado, el foco vuelve al botón pulsado (`ItemControls` hace lo mismo): se había
 *   desactivado mientras corría y el navegador lo suelta. Al enfocarlo, el lector de pantalla
 *   lee el motivo, que lo describe (`aria-describedby`); además sale en una alerta junto a los
 *   botones.
 */
export function DrillAdminActions({
  clubSlug,
  drillId,
  canPublish,
  canArchive,
}: {
  clubSlug: string;
  drillId: string;
  canPublish: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  // La acción ha terminado, pero la ficha aún no se ha repintado con el estado nuevo.
  const [refreshing, startRefresh] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Si empezó con algo que ofrecer: entonces sigue montado (con su aviso) aunque lo repintado
  // ya no ofrezca nada. Se decide una vez, al montarse.
  const [hosted] = useState(canPublish || canArchive);
  const root = useRef<HTMLDivElement>(null);
  // La última acción lanzada y si salió bien, para saber qué hacer al asentarse todo.
  const lastRun = useRef<{ control: Control; succeeded: boolean } | null>(null);
  const errorId = useId();

  const busy = pending || refreshing;

  // Cierra la hoja en cuanto termina lo que estaba esperando. Se deriva de `busy` al pintar y
  // no con un efecto (React lo recomienda para estado que sigue a otro): así la hoja se cierra
  // en la misma pintura en que llega el resultado, el motivo del fallo o la ficha nueva.
  const [wasBusy, setWasBusy] = useState(false);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (!busy) setConfirming(false);
  }

  // Al asentarse todo: el foco y el aviso (ver el comentario del componente). Si antes de
  // `SETTLE_MS` se lanza otra acción, `busy` vuelve a ser verdadero y se cancela la espera:
  // manda la última.
  useEffect(() => {
    if (busy) return;
    const finished = lastRun.current;
    if (finished === null) return;
    lastRun.current = null;

    const timer = setTimeout(() => {
      if (finished.succeeded) {
        document.getElementById(DRILL_TITLE_ID)?.focus();
        setAnnouncement(DONE_MESSAGE[finished.control]);
      } else {
        root.current?.querySelector<HTMLElement>(`[data-control="${finished.control}"]`)?.focus();
      }
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [busy]);

  if (!hosted && !canPublish && !canArchive) return null;

  function launch(control: Control, call: () => Promise<ActionResult<null>>) {
    setAnnouncement("");
    lastRun.current = { control, succeeded: false };
    run(call, () => {
      lastRun.current = { control, succeeded: true };
      startRefresh(() => router.refresh());
    });
  }

  const publish = () => launch("publish", () => publishDrill(clubSlug, { drillId }));
  const archive = () => launch("archive", () => archiveDrill(clubSlug, { drillId }));

  // Con un error, los botones lo describen: un lector de pantalla lo lee tras el nombre del que
  // se enfoca.
  const describedBy = failure ? errorId : undefined;

  return (
    <div ref={root} className="flex flex-col gap-(--space-3)">
      {canPublish ? (
        <CTAButton
          variant="primary"
          block
          data-control="publish"
          disabled={busy}
          aria-describedby={describedBy}
          onClick={publish}
        >
          Publicar
        </CTAButton>
      ) : null}
      {canArchive ? (
        <CTAButton
          variant="secondary"
          block
          data-control="archive"
          disabled={busy}
          aria-describedby={describedBy}
          onClick={() => setConfirming(true)}
        >
          Archivar
        </CTAButton>
      ) : null}

      {failure ? <FieldError id={errorId}>{ACTION_ERROR_COPY[failure.error]}</FieldError> : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {canArchive ? (
        <BottomSheet
          open={confirming}
          onOpenChange={(open) => {
            if (!busy) setConfirming(open);
          }}
          title="¿Archivar este ejercicio?"
          footer={
            <div className="flex flex-col gap-(--space-2)">
              <CTAButton variant="primary" block disabled={busy} onClick={archive}>
                Archivar
              </CTAButton>
              <CTAButton variant="secondary" block disabled={busy} onClick={() => setConfirming(false)}>
                Cancelar
              </CTAButton>
            </div>
          }
        >
          <p className="px-(--space-4) pb-(--space-3) text-body text-ink-2">
            Dejará de salir en la biblioteca. Las sesiones que ya lo usan lo conservan.
          </p>
        </BottomSheet>
      ) : null}
    </div>
  );
}
