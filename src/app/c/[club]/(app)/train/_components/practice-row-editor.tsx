"use client";

import { useId } from "react";
import { ITEM_NOTES_MAX, TITLE_MAX } from "@/modules/practice/limits";
import type { PracticeItemDraft } from "@/modules/practice/types";
import { FieldError, SelectField, TextAreaField, TextField } from "@/ui/form-field";
import type { RowErrors } from "./practice-rows";

/** Lo que se cambia de un ítem desde su fila abierta. Los minutos tienen sus botones en la fila. */
export type RowFields = Pick<PracticeItemDraft, "title" | "phase" | "notes">;

/**
 * Lo que se edita de un ítem con su fila abierta en el constructor: la fase, el título (solo si
 * es un bloque libre: el de un ejercicio de la biblioteca es el del ejercicio) y las notas. Va
 * dentro de `PracticeItem`, encima de «Subir», «Bajar» y «Quitar».
 *
 * No guarda nada: cada cambio sube con `onChange` y la lista es de quien lo monta. Un campo
 * vacío es «sin fase» o «sin notas» (`null`), no un texto vacío.
 *
 * Es un grupo con el nombre del ítem («Editar 3 calles»): la pantalla tiene otro «Título» y
 * otras «Notas», los de la sesión, y así se sabe de cuál se habla.
 *
 * `errors` son los que devolvió el último guardado para esta fila. Cada uno sale bajo su campo;
 * los que no tienen campo aquí (los minutos, o el título de un ejercicio) salen arriba.
 */
export function PracticeRowEditor({
  name,
  item,
  phases,
  errors,
  onChange,
}: {
  name: string;
  item: Pick<PracticeItemDraft, "drillId" | "title" | "phase" | "notes">;
  phases: ReadonlyArray<{ value: string; label: string }>;
  errors: RowErrors;
  onChange: (fields: Partial<RowFields>) => void;
}) {
  const errorId = useId();
  const freeBlock = item.drillId === null;
  const shown = new Set(freeBlock ? ["phase", "title", "notes"] : ["phase", "notes"]);
  const unplaced = Object.entries(errors).filter(([field]) => !shown.has(field));

  return (
    <div role="group" aria-label={`Editar ${name}`} className="flex flex-col gap-(--space-3)">
      {unplaced.map(([field, message]) => (
        <FieldError key={field} id={`${errorId}-${field}`}>
          {message}
        </FieldError>
      ))}
      <SelectField
        label="Fase"
        name="phase"
        value={item.phase ?? ""}
        options={phases}
        onChange={(phase) => onChange({ phase: phase === "" ? null : phase })}
        error={errors.phase}
      />
      {freeBlock ? (
        <TextField
          label="Título"
          name="title"
          value={item.title}
          onChange={(title) => onChange({ title })}
          maxLength={TITLE_MAX}
          error={errors.title}
        />
      ) : null}
      <TextAreaField
        label="Notas"
        name="notes"
        value={item.notes ?? ""}
        onChange={(notes) => onChange({ notes: notes === "" ? null : notes })}
        maxLength={ITEM_NOTES_MAX}
        rows={3}
        error={errors.notes}
      />
    </div>
  );
}
