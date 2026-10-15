"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createTeam, deleteTeam, updateTeam } from "@/modules/structure/actions";
import { NAME_MAX } from "@/modules/structure/schema";
import type { Category } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";
import { EditorForm, NewItemCard, useConfirmation } from "./editor-shell";
import { BLOCK_HEADING_CLASS } from "./structure-shared";

/** Lo que el formulario necesita de un equipo que existe. */
type EditableTeam = { id: string; name: string; categoryId: string };

/**
 * Un equipo: su nombre y su categoría. Con `team` es el formulario de uno que existe; sin él, el
 * alta en la temporada `seasonId`, que lleva a la página del equipo para montarlo. La temporada
 * de un equipo no se cambia.
 *
 * Sin categorías no hay equipo que crear: quien monta la página enseña antes cómo crearlas.
 */
export function TeamEditor({
  clubSlug,
  seasonId,
  team,
  categories,
}: {
  clubSlug: string;
  seasonId: string;
  team?: EditableTeam;
  categories: readonly Pick<Category, "id" | "name">[];
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const [name, setName] = useState(team?.name ?? "");
  const [categoryId, setCategoryId] = useState(team?.categoryId ?? categories[0]?.id ?? "");

  function submit() {
    clear();
    if (team) {
      run(
        () => updateTeam(clubSlug, { id: team.id, name, categoryId }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createTeam(clubSlug, { seasonId, name, categoryId }),
      ({ id }) => router.push(`/c/${clubSlug}/admin/teams/${id}`),
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const form = (
    <EditorForm
      mode={team ? "edit" : "create"}
      headingId={headingId}
      submitLabel={team ? "Guardar" : "Crear equipo"}
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
        error={errors.name}
      />
      <SelectField
        label="Categoría"
        name="categoryId"
        value={categoryId}
        onChange={touch(setCategoryId)}
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
        error={errors.categoryId}
      />
    </EditorForm>
  );

  if (!team) {
    return (
      <NewItemCard headingId={headingId} title="Nuevo equipo">
        {form}
      </NewItemCard>
    );
  }

  return (
    <Card>
      <h2 id={headingId} className={BLOCK_HEADING_CLASS}>
        Datos del equipo
      </h2>
      {form}
    </Card>
  );
}

/**
 * Borrar un equipo, con confirmación: se va con su cuerpo técnico y su plantilla, no con las
 * personas. Un equipo con actividad no se borra (`IN_USE`), y se dice. Al borrarlo, vuelve a su
 * temporada.
 */
export function TeamDelete({
  clubSlug,
  team,
  seasonId,
}: {
  clubSlug: string;
  team: Pick<EditableTeam, "id" | "name">;
  seasonId: string;
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const [asking, setAsking] = useState(false);

  function remove() {
    run(
      async () => {
        try {
          return await deleteTeam(clubSlug, { id: team.id });
        } finally {
          setAsking(false);
        }
      },
      () => router.push(`/c/${clubSlug}/admin/season/${seasonId}`),
    );
  }

  return (
    <div className="flex flex-col gap-(--space-3)">
      {failure ? (
        <FormAlert
          message={
            failure.error === "IN_USE"
              ? "Este equipo ya tiene actividad (sesiones, partidos, objetivos o notas) y no se puede borrar."
              : ACTION_ERROR_COPY[failure.error]
          }
        />
      ) : null}
      <CTAButton variant="danger" className="self-start" disabled={pending} onClick={() => setAsking(true)}>
        Borrar equipo
      </CTAButton>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`¿Borrar el equipo ${team.name}?`}
        body="Se va con su cuerpo técnico y su plantilla. Las personas siguen en el club. No se puede deshacer."
        confirmLabel="Borrar equipo"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={remove}
      />
    </div>
  );
}
