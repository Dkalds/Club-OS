"use client";

import { useId, useState } from "react";
import { FIELD_CONTROL_CLASS, FIELD_LABEL_CLASS, FieldError } from "./form-field";
import { AlertIcon } from "./icons";
import { MarkdownBody } from "./markdown-body";

const COUNT = new Intl.NumberFormat("es-ES");

type Mode = "write" | "preview";

const TAB =
  "min-h-(--target-min) border-b-2 px-(--space-4) font-display text-title uppercase " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
const TAB_ACTIVE = "border-brand-accent bg-brand-accent-soft text-brand-accent";
const TAB_IDLE = "border-transparent text-ink-2";

/**
 * El editor del texto largo de una sección: Markdown en un área de texto y, en la otra
 * pestaña, cómo lo verá el entrenador (`MarkdownBody`, el mismo renderizador de The Way).
 *
 * Con «Vista previa» el área de texto sigue montada, solo oculta: su texto, su selección y
 * el foco del formulario no se pierden al cambiar de pestaña. El contador cuenta los
 * caracteres de `value` y avisa al pasar de `maxLength`, pero el área no corta lo que se
 * escribe o se pega: quien se pasa tiene que verlo para decidir qué recortar (guardar con el
 * texto demasiado largo lo rechaza el servidor).
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  maxLength,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
}) {
  const [mode, setMode] = useState<Mode>("write");
  const id = useId();
  const textareaId = `${id}-text`;
  const helpId = `${id}-help`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const tabId = (which: Mode) => `${id}-tab-${which}`;
  const panelId = (which: Mode) => `${id}-panel-${which}`;

  const tooLong = value.length > maxLength;
  const describedBy = [helpId, countId, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-(--space-2)">
      <label htmlFor={textareaId} className={FIELD_LABEL_CLASS}>
        {label}
      </label>

      <div className="flex flex-col">
        <div role="tablist" aria-label="Modo del editor" className="flex border-b border-line">
          {(
            [
              ["write", "Escribir"],
              ["preview", "Vista previa"],
            ] as const
          ).map(([which, name]) => (
            <button
              key={which}
              type="button"
              role="tab"
              id={tabId(which)}
              aria-selected={mode === which}
              aria-controls={panelId(which)}
              onClick={() => setMode(which)}
              className={`${TAB} ${mode === which ? TAB_ACTIVE : TAB_IDLE}`}
            >
              {name}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={panelId("write")}
          aria-labelledby={tabId("write")}
          hidden={mode !== "write"}
          className="pt-(--space-3)"
        >
          <textarea
            id={textareaId}
            rows={12}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error || tooLong ? true : undefined}
            aria-describedby={describedBy}
            className={`${FIELD_CONTROL_CLASS} min-h-(--target-min) resize-y py-(--space-3)`}
          />
        </div>

        <div
          role="tabpanel"
          id={panelId("preview")}
          aria-labelledby={tabId("preview")}
          hidden={mode !== "preview"}
          className="pt-(--space-3)"
        >
          {mode === "preview" ? (
            <div className="rounded-md border border-line bg-surface-1 p-(--space-4)">
              {value.trim() === "" ? (
                <p className="text-ink-3">Aún no hay nada que mostrar.</p>
              ) : (
                <MarkdownBody markdown={value} />
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-start justify-between gap-(--space-3) text-body-s">
        <p id={helpId} className="text-ink-3">
          Puedes usar **negrita**, *cursiva*, listas, ### subtítulos, &gt; citas y enlaces.
        </p>
        <p id={countId} className="flex shrink-0 flex-col items-end gap-(--space-1) text-ink-3 tabular-nums">
          <span>{`${COUNT.format(value.length)} / ${COUNT.format(maxLength)}`}</span>
          {tooLong ? (
            <span className="flex items-center gap-(--space-1) text-danger">
              <AlertIcon size={16} />
              Demasiado largo
            </span>
          ) : null}
        </p>
      </div>

      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
