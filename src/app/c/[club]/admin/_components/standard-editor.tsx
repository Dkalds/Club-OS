"use client";

import { useId, useRef, useState } from "react";
import { useAction } from "@/lib/use-action";
import { createStandard, updateStandard } from "@/modules/methodology/actions";
import { formatStandardNumber } from "@/modules/methodology/format";
import type { AdminStandard } from "@/modules/methodology/types";
import { TextAreaField, TextField } from "@/ui/form-field";
import { EditorForm, focusField, ItemCard, NewItemCard, useConfirmation } from "./editor-shell";
import { ItemControls } from "./item-controls";

/**
 * Un Standard del club en Gestión: su número, su título y su descripción. Con `standard` es la
 * card de uno que existe, con su estado y sus controles (`isFirst` e `isLast` dicen si es el
 * primero o el último de la lista, que no pueden subir ni bajar); sin él, el alta de uno nuevo,
 * que nace en borrador y al final de la lista.
 *
 * El número lo elige dirección y es único por club: la acción lo valida (entre 1 y 99) y, si ya
 * existe, el error sale bajo «Número». El campo lleva `min` y `max` con ese rango (el que manda
 * es la acción: el navegador no valida, el formulario es `noValidate`). El alta propone
 * `defaultNumber` (el mayor de la lista más uno); tras crear uno, propone el siguiente al mayor
 * entre el anterior y el que se acaba de crear, sin esperar a que la página se repinte con la
 * lista nueva: sale lo mismo antes y después.
 *
 * El estado del formulario sale del Standard una sola vez: al guardar, la página se repinta con
 * los datos nuevos (la acción revalida Gestión) y eso no debe pisar lo que se esté escribiendo.
 * Tras un alta el formulario se vacía y recibe el foco, listo para el siguiente.
 */
export function StandardEditor({
  clubSlug,
  standard,
  defaultNumber = 1,
  isFirst = false,
  isLast = false,
}: {
  clubSlug: string;
  standard?: AdminStandard;
  defaultNumber?: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [number, setNumber] = useState(String(standard?.number ?? defaultNumber));
  const [title, setTitle] = useState(standard?.title ?? "");
  const [description, setDescription] = useState(standard?.description ?? "");

  function submit() {
    clear();
    // Un campo numérico vacío da "": `Number("")` es 0, que la acción rechaza como cualquier
    // número fuera de rango, con su mensaje bajo el campo.
    const chosen = Number(number);

    if (standard) {
      run(
        () => updateStandard(clubSlug, { id: standard.id, number: chosen, title, description }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createStandard(clubSlug, { number: chosen, title, description }),
      () => {
        setNumber(String(Math.max(defaultNumber - 1, chosen) + 1));
        setTitle("");
        setDescription("");
        confirm("Standard creado.");
        focusField(form.current, "title");
      },
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const editor = (
    <EditorForm
      ref={form}
      mode={standard ? "edit" : "create"}
      headingId={headingId}
      submitLabel={standard ? "Guardar" : "Crear Standard"}
      failure={failure}
      confirmation={message}
      pending={pending}
      onSubmit={submit}
    >
      <TextField
        label="Número"
        name="number"
        type="number"
        value={number}
        onChange={touch(setNumber)}
        min={1}
        max={99}
        error={errors.number}
      />
      <TextField
        label="Título"
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

  if (!standard) {
    return (
      <NewItemCard headingId={headingId} title="Nuevo Standard">
        {editor}
      </NewItemCard>
    );
  }

  return (
    <ItemCard
      headingId={headingId}
      title={standard.title}
      lead={
        <span className="shrink-0 font-display text-numeral text-brand-accent tabular-nums">
          {formatStandardNumber(standard.number)}
        </span>
      }
      status={standard.status}
      controls={
        <ItemControls
          clubSlug={clubSlug}
          kind="standards"
          id={standard.id}
          title={standard.title}
          status={standard.status}
          isFirst={isFirst}
          isLast={isLast}
        />
      }
    >
      {editor}
    </ItemCard>
  );
}
