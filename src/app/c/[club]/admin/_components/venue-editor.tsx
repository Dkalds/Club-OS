"use client";

import { useId, useRef, useState } from "react";
import { useAction } from "@/lib/use-action";
import { createVenue, deleteVenue, renameVenue } from "@/modules/calendar/actions";
import { VENUE_NAME_MAX } from "@/modules/calendar/schema";
import type { Venue } from "@/modules/calendar/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { TextField } from "@/ui/form-field";
import { EditorForm, focusField, NewItemCard, useConfirmation } from "./editor-shell";
import { BLOCK_HEADING_CLASS } from "./structure-shared";

/**
 * Una pista del club: su nombre. Con `venue` es la card de una que existe, a la que se le
 * cambia el nombre y que se borra si ningún horario la usa (si alguno la usa, dice de qué
 * equipos); sin ella, el alta.
 *
 * Cambiar el nombre se lo cambia a sus eventos programados que aún no han empezado, y no cuenta
 * como un cambio de lugar: la pista es la misma.
 */
export function VenueEditor({ clubSlug, venue }: { clubSlug: string; venue?: Venue }) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(venue?.name ?? "");
  const [asking, setAsking] = useState(false);

  function submit() {
    clear();
    if (venue) {
      run(
        () => renameVenue(clubSlug, { id: venue.id, name }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createVenue(clubSlug, { name }),
      () => {
        setName("");
        confirm("Pista creada.");
        focusField(form.current, "name");
      },
    );
  }

  function remove() {
    if (!venue) return;
    run(async () => {
      try {
        return await deleteVenue(clubSlug, { id: venue.id });
      } finally {
        setAsking(false);
      }
    });
  }

  const editor = (
    <EditorForm
      ref={form}
      mode={venue ? "edit" : "create"}
      headingId={headingId}
      submitLabel={venue ? "Guardar" : "Crear pista"}
      failure={failure}
      confirmation={message}
      pending={pending}
      onSubmit={submit}
    >
      <TextField
        label="Nombre"
        name="name"
        value={name}
        onChange={touch(setName)}
        maxLength={VENUE_NAME_MAX}
        hint={venue ? undefined : "Por ejemplo, Pabellón 2."}
        error={failure?.fieldErrors.name}
      />
    </EditorForm>
  );

  if (!venue) {
    return (
      <NewItemCard headingId={headingId} title="Nueva pista" level={3}>
        {editor}
      </NewItemCard>
    );
  }

  return (
    <Card>
      <h3 id={headingId} className={BLOCK_HEADING_CLASS}>
        {venue.name}
      </h3>
      {editor}
      <div className="border-t border-line pt-(--space-3)">
        {venue.usedBy.length > 0 ? (
          <p className="text-body-s text-ink-2">
            {`No se puede borrar: la usa el horario de ${venue.usedBy.join(", ")}. Quítaselo o cámbiale la pista en la página del equipo.`}
          </p>
        ) : (
          <CTAButton variant="danger" disabled={pending} aria-describedby={headingId} onClick={() => setAsking(true)}>
            Borrar pista
          </CTAButton>
        )}
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`¿Borrar la pista ${venue.name}?`}
        body="Los entrenamientos y los partidos que la tenían conservan su lugar. No se puede deshacer."
        confirmLabel="Borrar pista"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={remove}
      />
    </Card>
  );
}
