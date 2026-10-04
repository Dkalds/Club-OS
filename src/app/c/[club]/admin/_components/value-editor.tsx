"use client";

import { useId, useRef, useState } from "react";
import { createValue, updateValue } from "@/modules/methodology/actions";
import type { ClubValue } from "@/modules/methodology/types";
import { TextAreaField, TextField } from "@/ui/form-field";
import { EditorForm, focusField, ItemCard, NewItemCard, useConfirmation } from "./editor-shell";
import { ItemControls } from "./item-controls";
import { useAction } from "@/lib/use-action";

/**
 * Un valor del club en Gestión: su código, su título (opcional) y su descripción. Con `value`
 * es la card de un valor que existe, con su estado y sus controles (`isFirst` e `isLast` dicen
 * si es el primero o el último de la lista, que no pueden subir ni bajar); sin él, el alta de
 * uno nuevo, que nace en borrador y al final de la lista.
 *
 * El estado del formulario sale del valor una sola vez: al guardar, la página se repinta con
 * los datos nuevos (la acción revalida Gestión) y eso no debe pisar lo que se esté escribiendo.
 * Tras un alta el formulario se vacía y recibe el foco, listo para el siguiente.
 */
export function ValueEditor({
  clubSlug,
  value,
  isFirst = false,
  isLast = false,
}: {
  clubSlug: string;
  value?: ClubValue;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState(value?.code ?? "");
  const [title, setTitle] = useState(value?.title ?? "");
  const [description, setDescription] = useState(value?.description ?? "");

  function submit() {
    clear();
    if (value) {
      run(
        () => updateValue(clubSlug, { id: value.id, code, title, description }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createValue(clubSlug, { code, title, description }),
      () => {
        setCode("");
        setTitle("");
        setDescription("");
        confirm("Valor creado.");
        focusField(form.current, "code");
      },
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const editor = (
    <EditorForm
      ref={form}
      mode={value ? "edit" : "create"}
      headingId={headingId}
      submitLabel={value ? "Guardar" : "Crear valor"}
      failure={failure}
      confirmation={message}
      pending={pending}
      onSubmit={submit}
    >
      <TextField
        label="Código"
        name="code"
        value={code}
        onChange={touch(setCode)}
        maxLength={40}
        error={errors.code}
      />
      <TextField
        label="Título (opcional)"
        name="title"
        value={title}
        onChange={touch(setTitle)}
        maxLength={80}
        error={errors.title}
      />
      <TextAreaField
        label="Descripción"
        name="description"
        value={description}
        onChange={touch(setDescription)}
        maxLength={500}
        rows={3}
        error={errors.description}
      />
    </EditorForm>
  );

  if (!value) {
    return (
      <NewItemCard headingId={headingId} title="Nuevo valor">
        {editor}
      </NewItemCard>
    );
  }

  return (
    <ItemCard
      headingId={headingId}
      title={value.code}
      status={value.status}
      controls={
        <ItemControls
          clubSlug={clubSlug}
          kind="club_values"
          id={value.id}
          title={value.code}
          status={value.status}
          isFirst={isFirst}
          isLast={isLast}
        />
      }
    >
      {editor}
    </ItemCard>
  );
}
