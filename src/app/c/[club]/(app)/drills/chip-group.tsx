"use client";

import { useId } from "react";
import { FIELD_LABEL_CLASS, FieldError } from "@/ui/form-field";
import { Chip } from "@/ui/filter";

/**
 * Un grupo de chips de selección múltiple (los objetivos, los principios y los Standards de un
 * ejercicio): cada chip es un botón con `aria-pressed`, y el grupo lleva el nombre de `legend`.
 *
 * A diferencia de la fila de un filtro, que se desplaza en horizontal, aquí los chips pasan a la
 * línea siguiente: en un formulario hay que ver todo lo que se puede elegir sin deslizar. Un
 * nombre largo se trunca en vez de ensanchar la pantalla.
 *
 * `name` es la clave del error del grupo (`focusAreaIds`…): el formulario busca por ella el
 * primer campo que falla para llevarle el foco, que va al primer chip (`data-field`). `empty` es
 * lo que se dice si no hay nada que elegir.
 */
export function ChipGroup({
  name,
  legend,
  options,
  selected,
  onToggle,
  error,
  empty,
}: {
  name: string;
  legend: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  error?: string;
  empty?: string;
}) {
  const errorId = useId();

  return (
    <fieldset
      data-field={name}
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-(--space-2)"
    >
      <legend className={`${FIELD_LABEL_CLASS} mb-(--space-2)`}>{legend}</legend>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-(--space-2)">
          {options.map((option) => (
            <Chip key={option.id} pressed={selected.includes(option.id)} onClick={() => onToggle(option.id)}>
              <span className="truncate">{option.label}</span>
            </Chip>
          ))}
        </div>
      ) : empty ? (
        <p className="text-body-s text-ink-3">{empty}</p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}
