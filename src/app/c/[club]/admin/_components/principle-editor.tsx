"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAction } from "@/lib/use-action";
import { createPrinciple, savePrinciple } from "@/modules/methodology/actions";
import { moveAt } from "@/modules/methodology/order";
import type { GamePrinciple } from "@/modules/methodology/types";
import { CTAButton } from "@/ui/cta-button";
import { FIELD_LABEL_CLASS, FieldError, TextAreaField, TextField } from "@/ui/form-field";
import { EditorForm, focusField, ItemCard, NewItemCard, useConfirmation } from "./editor-shell";
import { ItemControls } from "./item-controls";

/** Los puntos que admite un principio: el mismo tope que `savePrincipleSchema`. */
const MAX_POINTS = 12;
const AT_MOST = `Un principio tiene como máximo ${MAX_POINTS} puntos.`;

/**
 * Un punto en pantalla. `key` es de esta pantalla y no cambia mientras se edita: el id del
 * punto en la base de datos o, en uno nuevo, uno propio. Guardar reemplaza los puntos por otros
 * con ids nuevos, así que el id de la base de datos no sirve de identidad más allá de la carga.
 */
type Row = { key: string; text: string };

/** Dónde vuelve el foco tras tocar la lista: el campo o un botón de una fila, o «Añadir punto». */
type Focus = { key: string; control: "text" | "up" | "down" } | "add";

/** Si el botón que se usó ya no se puede usar (la fila llegó al extremo), el foco pasa a su pareja. */
const FOCUS_ORDER = {
  text: ["text"],
  up: ["up", "down"],
  down: ["down", "up"],
} as const;

/**
 * La lista de puntos de un principio: una fila por punto (el campo y «Subir», «Bajar» y
 * «Quitar») y «Añadir punto», que desaparece al llegar al tope. El estado de las filas es de
 * quien la usa (`rows`, `onRows`): se manda entero al guardar.
 *
 * Los botones llevan el número de su fila en el nombre («Subir punto 2»): sin él serían doce
 * «Subir» iguales. Al moverse una fila, quitarse o añadirse, el foco no se pierde: se queda en
 * el botón usado (o su pareja), pasa a la fila vecina o va al campo nuevo.
 *
 * `errors` son los errores de cada fila por su `key`, y `groupError` el de la lista entera.
 */
function PointsField({
  rows,
  onRows,
  errors,
  groupError,
}: {
  rows: Row[];
  onRows: (update: (current: Row[]) => Row[]) => void;
  errors: Record<string, string>;
  groupError?: string;
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
        control === "text"
          ? `[data-point="${target.key}"] input`
          : `[data-point="${target.key}"] [data-control="${control}"]:not(:disabled)`;
      const element = root.current?.querySelector<HTMLElement>(selector);
      if (element) {
        element.focus();
        return;
      }
    }
  }, [rows]);

  function add() {
    const key = `new-${nextKey.current++}`;
    focusOn.current = { key, control: "text" };
    onRows((current) => [...current, { key, text: "" }]);
  }

  function remove(index: number) {
    const neighbour = rows[index + 1] ?? rows[index - 1];
    focusOn.current = neighbour ? { key: neighbour.key, control: "text" } : "add";
    onRows((current) => current.filter((_, position) => position !== index));
  }

  function move(index: number, direction: "up" | "down") {
    focusOn.current = { key: rows[index].key, control: direction };
    onRows((current) => moveAt(current, index, direction));
  }

  function edit(key: string, text: string) {
    onRows((current) => current.map((row) => (row.key === key ? { ...row, text } : row)));
  }

  return (
    <fieldset
      ref={root}
      aria-describedby={groupError ? errorId : undefined}
      className="flex min-w-0 flex-col gap-(--space-3)"
    >
      <legend className={`${FIELD_LABEL_CLASS} mb-(--space-3)`}>Puntos</legend>

      {rows.length > 0 ? (
        <ol className="flex flex-col gap-(--space-4)">
          {rows.map((row, index) => {
            const label = `punto ${index + 1}`;

            return (
              <li
                key={row.key}
                data-point={row.key}
                className="flex flex-col gap-(--space-2) lg:flex-row lg:items-end lg:gap-(--space-3)"
              >
                <div className="min-w-0 lg:flex-1">
                  <TextField
                    label={`Punto ${index + 1}`}
                    name="points"
                    value={row.text}
                    onChange={(text) => edit(row.key, text)}
                    maxLength={200}
                    error={errors[row.key]}
                  />
                </div>
                <div className="flex items-center gap-(--space-2)">
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

      {groupError ? <FieldError id={errorId}>{groupError}</FieldError> : null}

      {rows.length < MAX_POINTS ? (
        <CTAButton
          variant="ghost"
          data-control="add"
          className="-ml-(--space-2) self-start"
          onClick={add}
        >
          Añadir punto
        </CTAButton>
      ) : (
        <p className="text-body-s text-ink-3">{AT_MOST}</p>
      )}
    </fieldset>
  );
}

/**
 * Un principio de juego del club en Gestión: su título, su resumen (opcional) y sus puntos. Con
 * `principle` es la card de uno que existe, con su estado y sus controles (`isFirst` e `isLast`
 * dicen si es el primero o el último de la lista, que no pueden subir ni bajar); sin él, el alta
 * de uno nuevo, que solo pide título y resumen: nace en borrador y al final de la lista, sin
 * puntos, que se le añaden al guardarlo.
 *
 * «Guardar» manda el título, el resumen y todos los puntos en el orden en que están en pantalla
 * (`savePrinciple` los reemplaza de una vez). Las filas en blanco viajan igual: la acción las
 * descarta, y al terminar bien se quitan también de aquí para que la pantalla diga lo que
 * quedó guardado. Si falla, no se pierde nada de lo escrito.
 *
 * El error de un punto lo da la acción por su posición (`points.1`); se asigna a la fila que
 * estaba en esa posición al enviar, de modo que lo sigue si luego se mueve y se va si se quita.
 *
 * El estado del formulario sale del principio una sola vez: al guardar, la página se repinta con
 * los datos nuevos (la acción revalida Gestión) y eso no debe pisar lo que se esté escribiendo.
 * Tras un alta el formulario se vacía y recibe el foco, listo para el siguiente.
 */
export function PrincipleEditor({
  clubSlug,
  principle,
  isFirst = false,
  isLast = false,
}: {
  clubSlug: string;
  principle?: GamePrinciple;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(principle?.title ?? "");
  const [summary, setSummary] = useState(principle?.summary ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    (principle?.points ?? []).map(({ id, text }) => ({ key: id, text })),
  );
  // Las filas que había al enviar, en su orden: lo que da sentido a `points.N` del error.
  const [submitted, setSubmitted] = useState<string[]>([]);

  /** Tocar los puntos (escribir, añadir, quitar, mover) deja sin efecto el aviso de guardado. */
  function changeRows(update: (current: Row[]) => Row[]) {
    setRows(update);
    clear();
  }

  function submit() {
    clear();
    if (principle) {
      setSubmitted(rows.map((row) => row.key));
      run(
        () =>
          savePrinciple(clubSlug, {
            id: principle.id,
            title,
            summary,
            points: rows.map((row) => row.text),
          }),
        () => {
          setRows((current) => current.filter((row) => row.text.trim() !== ""));
          confirm("Cambios guardados.");
        },
      );
      return;
    }
    run(
      () => createPrinciple(clubSlug, { title, summary }),
      () => {
        setTitle("");
        setSummary("");
        confirm("Principio creado.");
        focusField(form.current, "title");
      },
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const pointErrors: Record<string, string> = {};
  submitted.forEach((key, index) => {
    const error = errors[`points.${index}`];
    if (error) pointErrors[key] = error;
  });

  const editor = (
    <EditorForm
      ref={form}
      mode={principle ? "edit" : "create"}
      headingId={headingId}
      submitLabel={principle ? "Guardar" : "Crear principio"}
      failure={failure}
      confirmation={message}
      pending={pending}
      onSubmit={submit}
    >
      <TextField
        label="Título"
        name="title"
        value={title}
        onChange={touch(setTitle)}
        maxLength={80}
        error={errors.title}
      />
      <TextAreaField
        label="Resumen (opcional)"
        name="summary"
        value={summary}
        onChange={touch(setSummary)}
        maxLength={300}
        rows={3}
        error={errors.summary}
      />
      {principle ? (
        <PointsField
          rows={rows}
          onRows={changeRows}
          errors={pointErrors}
          groupError={errors.points}
        />
      ) : null}
    </EditorForm>
  );

  if (!principle) {
    return (
      <NewItemCard headingId={headingId} title="Nuevo principio">
        {editor}
      </NewItemCard>
    );
  }

  return (
    <ItemCard
      headingId={headingId}
      title={principle.title}
      status={principle.status}
      controls={
        <ItemControls
          clubSlug={clubSlug}
          kind="game_principles"
          id={principle.id}
          title={principle.title}
          status={principle.status}
          isFirst={isFirst}
          isLast={isLast}
        />
      }
    >
      {editor}
    </ItemCard>
  );
}
