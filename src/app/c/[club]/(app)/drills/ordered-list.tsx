"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { moveAt } from "@/modules/methodology/order";
import { CTAButton } from "@/ui/cta-button";
import { FIELD_LABEL_CLASS, FieldError } from "@/ui/form-field";

/** Dónde vuelve el foco tras tocar la lista: un campo o un botón de una fila, o «Añadir». */
type Focus = { key: string; control: "fields" | "up" | "down" } | "add";

/** Si el botón que se usó ya no se puede usar (la fila llegó al extremo), el foco pasa a su pareja. */
const FOCUS_ORDER = {
  fields: ["fields"],
  up: ["up", "down"],
  down: ["down", "up"],
} as const;

/** Una fila de `OrderedList`: lo mínimo que necesita para seguirla al moverla. */
type Row = { key: string };

/**
 * Una lista ordenada que se edita en pantalla (los coaching points y las variantes de un
 * ejercicio): una fila por elemento con sus campos y sus controles «Subir», «Bajar» y «Quitar», y
 * «Añadir» al final, que desaparece al llegar al tope (`max`) y deja su sitio a `atMost`.
 *
 * Es un grupo con su nombre (`legend`). Las filas son de quien la monta (`rows`, `onRows`): el
 * formulario las manda enteras al guardar. Qué lleva cada fila lo dice
 * `renderFields` (y `renderExtra`, controles propios de esa lista que van junto a los de mover,
 * como «Clave»); aquí no se sabe de qué es la lista.
 *
 * Los botones llevan el número de su fila en el nombre («Subir punto 2», con `noun` «punto»): sin
 * él serían ocho «Subir» iguales. Al moverse una fila, quitarse o añadirse, el foco no se
 * pierde: se queda en el botón usado (o su pareja), pasa a la fila vecina o va al primer campo
 * de la fila nueva. Es el comportamiento de los editores de Gestión (`PointsField`).
 *
 * `error` es el mensaje de toda la lista (el servidor no distingue la fila). Se enseña bajo las
 * filas y describe el grupo. `name` es la clave de ese error: el formulario busca por ella el
 * primer campo que falla para llevarle el foco (`data-field`).
 */
export function OrderedList<R extends Row>({
  name,
  legend,
  noun,
  addLabel,
  atMost,
  max,
  rows,
  onRows,
  createRow,
  renderFields,
  renderExtra,
  error,
}: {
  name: string;
  legend: string;
  noun: string;
  addLabel: string;
  atMost: string;
  max: number;
  rows: R[];
  onRows: (update: (current: R[]) => R[]) => void;
  createRow: (key: string) => R;
  /** Los campos de la fila; `edit` cambia lo que haga falta de ella. */
  renderFields: (row: R, index: number, edit: (patch: Partial<R>) => void) => ReactNode;
  /** Controles propios de la lista, antes de «Subir». */
  renderExtra?: (row: R, index: number, edit: (patch: Partial<R>) => void) => ReactNode;
  error?: string;
}) {
  const errorId = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const nextKey = useRef(0);
  const focusOn = useRef<Focus | null>(null);

  // Las filas ya están repintadas, con sus botones en su estado definitivo.
  useEffect(() => {
    const target = focusOn.current;
    if (target === null) return;
    focusOn.current = null;

    if (target === "add") {
      root.current?.querySelector<HTMLElement>('[data-control="add"]')?.focus();
      return;
    }
    for (const control of FOCUS_ORDER[target.control]) {
      const selector =
        control === "fields"
          ? `[data-row="${target.key}"] :is(input, textarea)`
          : `[data-row="${target.key}"] [data-control="${control}"]:not(:disabled)`;
      const element = root.current?.querySelector<HTMLElement>(selector);
      if (element) {
        element.focus();
        return;
      }
    }
  }, [rows]);

  function add() {
    const key = `new-${nextKey.current++}`;
    focusOn.current = { key, control: "fields" };
    onRows((current) => [...current, createRow(key)]);
  }

  function remove(index: number) {
    const neighbour = rows[index + 1] ?? rows[index - 1];
    focusOn.current = neighbour ? { key: neighbour.key, control: "fields" } : "add";
    onRows((current) => current.filter((_, position) => position !== index));
  }

  function move(index: number, direction: "up" | "down") {
    focusOn.current = { key: rows[index].key, control: direction };
    onRows((current) => moveAt(current, index, direction));
  }

  function editor(key: string) {
    return (patch: Partial<R>) =>
      onRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset
      ref={root}
      data-field={name}
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-(--space-3)"
    >
      <legend className={`${FIELD_LABEL_CLASS} mb-(--space-3)`}>{legend}</legend>

      {rows.length > 0 ? (
        <ol className="flex flex-col gap-(--space-4)">
          {rows.map((row, index) => {
            const label = `${noun} ${index + 1}`;
            const edit = editor(row.key);

            return (
              <li
                key={row.key}
                data-row={row.key}
                className="flex flex-col gap-(--space-3) rounded-md border border-line p-(--space-3)"
              >
                {renderFields(row, index, edit)}
                <div className="flex flex-wrap items-center gap-(--space-2)">
                  {renderExtra?.(row, index, edit)}
                  <CTAButton
                    variant="ghost"
                    data-control="up"
                    aria-label={`Subir ${label}`}
                    disabled={index === 0}
                    onClick={() => move(index, "up")}
                  >
                    Subir
                  </CTAButton>
                  <CTAButton
                    variant="ghost"
                    data-control="down"
                    aria-label={`Bajar ${label}`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, "down")}
                  >
                    Bajar
                  </CTAButton>
                  <CTAButton
                    variant="ghost"
                    data-control="remove"
                    aria-label={`Quitar ${label}`}
                    onClick={() => remove(index)}
                  >
                    Quitar
                  </CTAButton>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {error ? <FieldError id={errorId}>{error}</FieldError> : null}

      {rows.length < max ? (
        <CTAButton
          variant="ghost"
          data-control="add"
          className="-ml-(--space-2) self-start"
          onClick={add}
        >
          {addLabel}
        </CTAButton>
      ) : (
        <p className="text-body-s text-ink-3">{atMost}</p>
      )}
    </fieldset>
  );
}
