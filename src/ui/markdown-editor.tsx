"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { FIELD_CONTROL_CLASS, FIELD_LABEL_CLASS, FieldError } from "./form-field";
import { AlertIcon } from "./icons";
import { MarkdownBody } from "./markdown-body";

// `always`: `es-ES` no agrupa por defecto las cifras de cuatro dígitos («1500») pero sí las de
// cinco («12.345»), y el contador no puede leerse de las dos maneras.
const COUNT = new Intl.NumberFormat("es-ES", { useGrouping: "always" });

type Mode = "write" | "preview";

/** Las pestañas, en su orden: el modo y su nombre. */
const TABS = [
  ["write", "Escribir"],
  ["preview", "Vista previa"],
] as const satisfies ReadonlyArray<readonly [Mode, string]>;

const TAB =
  "min-h-(--target-min) border-b-2 px-(--space-4) font-display text-title uppercase " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
const TAB_ACTIVE = "border-brand-accent bg-brand-accent-soft text-brand-accent";
const TAB_IDLE = "border-transparent text-ink-2";

/**
 * El editor del texto largo de una sección: Markdown en un área de texto y, en la otra
 * pestaña, cómo lo verá el entrenador (`MarkdownBody`, el mismo renderizador de The Way).
 *
 * Las dos pestañas siguen el patrón de teclado de unas pestañas: solo la seleccionada está en
 * el orden de tabulación, y entre ellas se va con las flechas, Inicio y Fin.
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

  const tabs = useRef<Partial<Record<Mode, HTMLButtonElement | null>>>({});

  // Las flechas van de una pestaña a otra (de la última se vuelve a la primera), e Inicio y Fin
  // a los extremos. La pestaña que recibe el foco queda seleccionada: su panel ya está pintado.
  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TABS.findIndex(([which]) => which === mode);
    const last = TABS.length - 1;
    const target = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;

    event.preventDefault();
    const [which] = TABS[target];
    setMode(which);
    tabs.current[which]?.focus();
  }

  const tooLong = value.length > maxLength;
  const describedBy = [helpId, countId, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-(--space-2)">
      <label htmlFor={textareaId} className={FIELD_LABEL_CLASS}>
        {label}
      </label>

      <div className="flex flex-col">
        <div
          role="tablist"
          aria-label="Modo del editor"
          onKeyDown={onTabKeyDown}
          className="flex border-b border-line"
        >
          {TABS.map(([which, name]) => (
            <button
              key={which}
              ref={(node) => {
                tabs.current[which] = node;
              }}
              type="button"
              role="tab"
              id={tabId(which)}
              aria-selected={mode === which}
              aria-controls={panelId(which)}
              tabIndex={mode === which ? 0 : -1}
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
