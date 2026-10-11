"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createSeason, deleteSeason, setCurrentSeason, updateSeason } from "@/modules/structure/actions";
import { NAME_MAX } from "@/modules/structure/schema";
import type { SeasonSummary } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";
import { EditorForm, NewItemCard, useConfirmation } from "./editor-shell";
import { BLOCK_HEADING_CLASS } from "./structure-shared";

/** El valor del selector de «Copiar equipos de» cuando no se copia nada. */
const NO_COPY = "";

/**
 * Una temporada en Gestión: su nombre y sus fechas. Con `season` es el formulario de una que
 * existe; sin él, el alta, que puede nacer con los equipos de otra temporada (`copyFrom`:
 * nombre y categoría, vacíos) y lleva a la temporada recién creada.
 *
 * El estado del formulario sale de la temporada una sola vez: al guardar, la página se repinta
 * con los datos nuevos y eso no debe pisar lo que se esté escribiendo.
 */
export function SeasonEditor({
  clubSlug,
  season,
  copyFrom = [],
}: {
  clubSlug: string;
  season?: SeasonSummary;
  copyFrom?: readonly SeasonSummary[];
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const [name, setName] = useState(season?.name ?? "");
  const [startsOn, setStartsOn] = useState(season?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(season?.endsOn ?? "");
  const [copy, setCopy] = useState(NO_COPY);

  function submit() {
    clear();
    if (season) {
      run(
        () => updateSeason(clubSlug, { id: season.id, name, startsOn, endsOn }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createSeason(clubSlug, { name, startsOn, endsOn, copyTeamsFrom: copy === NO_COPY ? null : copy }),
      ({ id }) => router.push(`/c/${clubSlug}/admin/season/${id}`),
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const form = (
    <EditorForm
      mode={season ? "edit" : "create"}
      headingId={headingId}
      submitLabel={season ? "Guardar" : "Crear temporada"}
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
        maxLength={NAME_MAX}
        hint={season ? undefined : "Por ejemplo, 2027/28."}
        error={errors.name}
      />
      <TextField
        label="Inicio"
        name="startsOn"
        type="date"
        value={startsOn}
        onChange={touch(setStartsOn)}
        error={errors.startsOn}
      />
      <TextField
        label="Fin"
        name="endsOn"
        type="date"
        value={endsOn}
        onChange={touch(setEndsOn)}
        error={errors.endsOn}
      />
      {!season && copyFrom.length > 0 ? (
        <SelectField
          label="Copiar equipos de"
          name="copyTeamsFrom"
          value={copy}
          onChange={setCopy}
          options={[
            { value: NO_COPY, label: "No copiar" },
            ...copyFrom.map((other) => ({ value: other.id, label: other.name })),
          ]}
        />
      ) : null}
    </EditorForm>
  );

  if (!season) {
    return (
      <NewItemCard headingId={headingId} title="Nueva temporada">
        {form}
      </NewItemCard>
    );
  }

  return (
    <Card>
      <h2 id={headingId} className={BLOCK_HEADING_CLASS}>
        Datos de la temporada
      </h2>
      {form}
    </Card>
  );
}

/**
 * Lo que se hace con una temporada entera: marcarla como la actual del club y borrarla. Las dos
 * cosas piden confirmación. La actual no ofrece ninguna de las dos, y borrar solo se ofrece sin
 * equipos (`hasTeams`): la base lo impediría igual.
 *
 * Recién marcada, los botones se van y queda dicho que ya es la actual: la región de estado
 * está siempre, para que un lector de pantalla lo anuncie.
 */
export function SeasonActions({
  clubSlug,
  season,
  hasTeams,
}: {
  clubSlug: string;
  season: SeasonSummary;
  hasTeams: boolean;
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const [asking, setAsking] = useState<"current" | "delete" | null>(null);
  const [marked, setMarked] = useState(false);

  if (season.isCurrent && !marked) return null;

  function markCurrent() {
    run(
      async () => {
        try {
          return await setCurrentSeason(clubSlug, { id: season.id });
        } finally {
          setAsking(null);
        }
      },
      () => setMarked(true),
    );
  }

  function remove() {
    run(
      async () => {
        try {
          return await deleteSeason(clubSlug, { id: season.id });
        } finally {
          setAsking(null);
        }
      },
      () => router.push(`/c/${clubSlug}/admin/season`),
    );
  }

  return (
    <div className="flex flex-col gap-(--space-3)">
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}
      {/* Siempre en el árbol de accesibilidad, también vacía (nunca `display: none`): un lector de
          pantalla solo anuncia lo que cambia en una región que ya estaba. El margen anula su hueco. */}
      <p role="status" className="text-body-strong text-success empty:-mt-(--space-3)">
        {marked ? "Ya es la temporada actual." : null}
      </p>
      {marked ? null : (
        <div className="flex flex-wrap gap-(--space-2)">
          <CTAButton variant="secondary" disabled={pending} onClick={() => setAsking("current")}>
            Marcar como actual
          </CTAButton>
          {hasTeams ? null : (
            <CTAButton variant="danger" disabled={pending} onClick={() => setAsking("delete")}>
              Borrar temporada
            </CTAButton>
          )}
        </div>
      )}
      <ConfirmDialog
        open={asking === "current"}
        onOpenChange={(open) => setAsking(open ? "current" : null)}
        title={`¿Marcar ${season.name} como la temporada actual?`}
        body="La agenda, las sesiones y los equipos que ve todo el club pasan a ser los de esta temporada. Nada se borra."
        confirmLabel="Marcar como actual"
        cancelLabel="Volver"
        pending={pending}
        onConfirm={markCurrent}
      />
      <ConfirmDialog
        open={asking === "delete"}
        onOpenChange={(open) => setAsking(open ? "delete" : null)}
        title={`¿Borrar la temporada ${season.name}?`}
        body="No tiene equipos. No se puede deshacer."
        confirmLabel="Borrar temporada"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={remove}
      />
    </div>
  );
}
