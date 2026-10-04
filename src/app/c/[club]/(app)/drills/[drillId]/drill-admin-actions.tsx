"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ACTION_ERROR_COPY, type ActionResult } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { archiveDrill, publishDrill } from "@/modules/drills/actions";
import { BottomSheet } from "@/ui/bottom-sheet";
import { CTAButton } from "@/ui/cta-button";
import { FieldError } from "@/ui/form-field";

/**
 * Los botones de dirección de la ficha de un ejercicio: «Publicar» (un borrador, o un archivado
 * que vuelve) y «Archivar» (con confirmación). Qué se ofrece lo decide la página con
 * `drillPermissions`; aquí solo se muestra u oculta, y lo que protege es la Server Action
 * (`can`) y RLS. Si no se puede ni publicar ni archivar, no pinta nada.
 *
 * «Publicar» no pide confirmación (se puede deshacer archivando). «Archivar» abre una hoja que
 * explica qué cambia: el ejercicio deja de salir en la biblioteca, pero las sesiones que ya lo
 * usan lo conservan.
 *
 * Al salir bien, `router.refresh()` repinta la ficha con el estado nuevo (las acciones ya
 * revalidan las rutas), y mientras dura, igual que mientras corre la acción, los botones
 * esperan: un segundo toque no lanza otra. Un lector de pantalla oye el resultado en un aviso
 * (`role="status"`) que existe desde el principio, vacío: uno que aparece con su texto puesto
 * no siempre se lee. Si falla, el motivo sale junto a los botones, como alerta, y los
 * describe. La hoja, que sigue abierta mientras la acción corre y no se deja cerrar a medias
 * (el resultado llegaría a una pantalla sin hoja), se cierra al terminar, salga como salga.
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

  if (!canPublish && !canArchive) return null;

  function launch(call: () => Promise<ActionResult<null>>, message: string) {
    setAnnouncement("");
    run(call, () => {
      setAnnouncement(message);
      startRefresh(() => router.refresh());
    });
  }

  const publish = () => launch(() => publishDrill(clubSlug, { drillId }), "Ejercicio publicado.");
  const archive = () => launch(() => archiveDrill(clubSlug, { drillId }), "Ejercicio archivado.");

  // Con un error, los botones lo describen: un lector de pantalla lo lee tras el nombre del que
  // se enfoca.
  const describedBy = failure ? errorId : undefined;

  return (
    <div className="flex flex-col gap-(--space-3)">
      {canPublish ? (
        <CTAButton
          variant="primary"
          block
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
