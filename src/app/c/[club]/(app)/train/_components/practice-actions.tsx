"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { cancelPractice, duplicatePractice } from "@/modules/practice/actions";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, TextField } from "@/ui/form-field";

/**
 * Lo que se hace con una sesión desde su detalle: editarla, duplicarla y cancelarla. Quien
 * lo monta decide si se pinta (solo con `practice.manage`); `canEdit` es de la sesión, que solo
 * se edita y se cancela mientras sigue programada (la hecha o la cancelada solo se duplican).
 *
 * «Editar sesión» es el `primary` de la pantalla y lleva al constructor. «Duplicar» (`secondary`)
 * abre un panel, no un diálogo (`aria-expanded`): la fecha y la hora de la copia, que parten de
 * lo que propone la página (la semana siguiente, a la misma hora del club). «Crear copia» es el
 * botón del propio panel y abre el detalle de la copia: `secondary` si la sesión se puede editar
 * (el `primary` de la pantalla es «Editar sesión») y `primary` si no (es entonces lo principal).
 * `copied` lo mantiene parado desde que sale bien hasta que la página cambia: un segundo toque
 * en ese rato crearía otra copia.
 *
 * «Cancelar sesión» (`danger`) pregunta antes con `ConfirmDialog`: cancelar saca la sesión de
 * Inicio y de Próximas, y no se deshace desde aquí. El diálogo se queda abierto, con sus botones
 * parados, hasta que la acción termina; sale como salga se cierra. Si ha ido bien, `refresh`
 * vuelve a pedir la página, que ya sabe que la sesión no es editable; si no, el motivo queda en
 * la página, donde se puede volver a intentar (el diálogo no tiene sitio para un aviso).
 *
 * Los dos avisos de fallo son de cada acción: uno fallado no tapa ni borra al otro.
 */
export function PracticeActions({
  clubSlug,
  eventId,
  canEdit,
  duplicateDefaults,
}: {
  clubSlug: string;
  eventId: string;
  canEdit: boolean;
  duplicateDefaults: { date: string; time: string };
}) {
  const router = useRouter();
  const panelId = useId();
  const duplicating = useAction();
  const cancelling = useAction();
  const [panelOpen, setPanelOpen] = useState(false);
  const [date, setDate] = useState(duplicateDefaults.date);
  const [time, setTime] = useState(duplicateDefaults.time);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function submitCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (duplicating.pending || copied) return;

    duplicating.run(
      () => duplicatePractice(clubSlug, { eventId, date, time }),
      ({ eventId: copyId }) => {
        setCopied(true);
        router.push(`/c/${clubSlug}/train/${copyId}`);
      },
    );
  }

  function confirmCancel() {
    cancelling.run(
      async () => {
        try {
          return await cancelPractice(clubSlug, { eventId });
        } finally {
          setConfirming(false);
        }
      },
      () => router.refresh(),
    );
  }

  const copyErrors = duplicating.failure?.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-(--space-3)">
      {canEdit ? (
        <CTAButton variant="primary" block href={`/c/${clubSlug}/train/${eventId}/edit`}>
          Editar sesión
        </CTAButton>
      ) : null}

      <CTAButton
        variant="secondary"
        block
        aria-expanded={panelOpen}
        // Solo mientras el panel está en el documento: un `aria-controls` no apunta a lo que no existe.
        aria-controls={panelOpen ? panelId : undefined}
        onClick={() => setPanelOpen((open) => !open)}
      >
        Duplicar
      </CTAButton>
      {panelOpen ? (
        <Card>
          <form id={panelId} onSubmit={submitCopy} noValidate className="flex flex-col gap-(--space-4)">
            {duplicating.failure ? <FormAlert message={ACTION_ERROR_COPY[duplicating.failure.error]} /> : null}
            <TextField
              label="Fecha"
              name="date"
              type="date"
              value={date}
              onChange={setDate}
              error={copyErrors.date}
            />
            <TextField
              label="Hora"
              name="time"
              type="time"
              value={time}
              onChange={setTime}
              error={copyErrors.time}
            />
            <CTAButton
              variant={canEdit ? "secondary" : "primary"}
              type="submit"
              block
              disabled={duplicating.pending || copied}
            >
              Crear copia
            </CTAButton>
          </form>
        </Card>
      ) : null}

      {canEdit ? (
        <>
          <CTAButton variant="danger" block onClick={() => setConfirming(true)}>
            Cancelar sesión
          </CTAButton>
          {cancelling.failure ? <FormAlert message={ACTION_ERROR_COPY[cancelling.failure.error]} /> : null}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="¿Cancelar esta sesión?"
            body="Dejará de salir en Inicio y en Próximas. Seguirá en el histórico."
            confirmLabel="Cancelar sesión"
            cancelLabel="Volver"
            tone="danger"
            pending={cancelling.pending}
            onConfirm={confirmCancel}
          />
        </>
      ) : null}
    </div>
  );
}
