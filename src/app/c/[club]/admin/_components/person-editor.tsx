"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createPerson, setPersonArchived, updatePerson } from "@/modules/structure/actions";
import { fullName } from "@/modules/structure/format";
import { BIRTH_YEAR_MIN, NAME_MAX } from "@/modules/structure/schema";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, TextField } from "@/ui/form-field";
import { EditorForm, NewItemCard, useConfirmation } from "./editor-shell";
import { BLOCK_HEADING_CLASS, toNumber } from "./structure-shared";

/** Lo que el formulario necesita de una persona que existe. */
type EditablePerson = { id: string; firstName: string; lastName: string; birthYear: number | null };

/**
 * Una persona del club: nombre, apellidos y año de nacimiento (de un menor nunca se pide la
 * fecha completa). Con `person` es el formulario de una que existe; sin ella, el alta, que lleva
 * a su página.
 */
export function PersonEditor({ clubSlug, person }: { clubSlug: string; person?: EditablePerson }) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const [firstName, setFirstName] = useState(person?.firstName ?? "");
  const [lastName, setLastName] = useState(person?.lastName ?? "");
  const [birthYear, setBirthYear] = useState(person?.birthYear ? String(person.birthYear) : "");

  function submit() {
    clear();
    const input = { firstName, lastName, birthYear: toNumber(birthYear) };
    if (person) {
      run(
        () => updatePerson(clubSlug, { id: person.id, ...input }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createPerson(clubSlug, input),
      ({ id }) => router.push(`/c/${clubSlug}/admin/people/${id}`),
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const form = (
    <EditorForm
      mode={person ? "edit" : "create"}
      headingId={headingId}
      submitLabel={person ? "Guardar" : "Dar de alta"}
      failure={failure}
      confirmation={message}
      pending={pending}
      onSubmit={submit}
    >
      <TextField
        label="Nombre"
        name="firstName"
        value={firstName}
        onChange={touch(setFirstName)}
        maxLength={NAME_MAX}
        error={errors.firstName}
      />
      <TextField
        label="Apellidos"
        name="lastName"
        value={lastName}
        onChange={touch(setLastName)}
        maxLength={NAME_MAX}
        error={errors.lastName}
      />
      <TextField
        label="Año de nacimiento (opcional)"
        name="birthYear"
        type="number"
        min={BIRTH_YEAR_MIN}
        value={birthYear}
        onChange={touch(setBirthYear)}
        hint="Solo el año, nunca la fecha completa."
        error={errors.birthYear}
      />
    </EditorForm>
  );

  if (!person) {
    return (
      <NewItemCard headingId={headingId} title="Nueva persona">
        {form}
      </NewItemCard>
    );
  }

  return (
    <Card>
      <h2 id={headingId} className={BLOCK_HEADING_CLASS}>
        Datos
      </h2>
      {form}
    </Card>
  );
}

/**
 * Archivar a una persona (ya no está en el club: sale de la lista y de los buscadores, y nada
 * se borra), con confirmación, o recuperarla. A quien sigue en un equipo de la temporada actual
 * no se la archiva: la acción lo dice, y aquí se enseña.
 */
export function PersonArchive({
  clubSlug,
  person,
  archived,
}: {
  clubSlug: string;
  person: EditablePerson;
  archived: boolean;
}) {
  const { pending, failure, run } = useAction();
  const [asking, setAsking] = useState(false);

  function set(next: boolean) {
    run(async () => {
      try {
        return await setPersonArchived(clubSlug, { id: person.id, archived: next });
      } finally {
        setAsking(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-(--space-3)">
      {failure ? (
        <FormAlert message={failure.fieldErrors.archived ?? ACTION_ERROR_COPY[failure.error]} />
      ) : null}
      {archived ? (
        <CTAButton variant="secondary" className="self-start" disabled={pending} onClick={() => set(false)}>
          Recuperar
        </CTAButton>
      ) : (
        <CTAButton variant="danger" className="self-start" disabled={pending} onClick={() => setAsking(true)}>
          Archivar
        </CTAButton>
      )}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`¿Archivar a ${fullName(person)}?`}
        body="Sale de la lista de personas y de los buscadores. No se borra nada y se puede recuperar."
        confirmLabel="Archivar"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={() => set(true)}
      />
    </div>
  );
}
