"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertIcon } from "./icons";

/**
 * Los campos de formulario del sistema, que Gestión y las fases siguientes reutilizan: una
 * etiqueta enlazada, el control y, si falla, su mensaje.
 *
 * El control es `surface-2` con borde `line-strong`, `radius-md` y al menos `target-min` de
 * alto. 17px de texto (`body-l`): por debajo de 16px iOS amplía la página al enfocar el campo.
 * Con `error`, el campo se marca (`aria-invalid`), apunta al mensaje (`aria-describedby`) y
 * el mensaje lleva icono además de `danger`: el color no basta.
 */

export const FIELD_LABEL_CLASS = "text-label uppercase text-ink-2";

/** Lo común a todo control; el alto lo pone cada uno (`h-` en un campo de una línea). */
export const FIELD_CONTROL_CLASS =
  "w-full rounded-md border border-line-strong bg-surface-2 px-(--space-4) text-body-l text-ink " +
  "aria-invalid:border-danger " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const FIELD_CLASS = "flex flex-col gap-(--space-2)";
const SINGLE_LINE = `${FIELD_CONTROL_CLASS} h-(--target-min)`;

/** El mensaje de un campo que ha fallado. `role="alert"`: se lee al aparecer. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-(--space-2) text-body-s text-danger">
      <AlertIcon size={16} />
      {children}
    </p>
  );
}

/**
 * El aviso de arriba de un formulario cuando guardar ha fallado: el texto del error y, si
 * hace falta, su salida (`children`: «Recargar»). `role="alert"`, con icono además de `danger`.
 *
 * Se lleva el foco al aparecer: un formulario largo se envía desde un botón que queda lejos
 * del aviso, y sin él quien guarda no vería que ha fallado. El formulario lo monta solo
 * cuando hay un error y lo quita al volver a enviar, así que cada fallo nuevo vuelve a
 * montarlo y a llevarse el foco.
 */
export function FormAlert({ message, children }: { message: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex flex-col gap-(--space-3) rounded-md border border-danger bg-danger-soft p-(--space-4) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <p className="flex items-start gap-(--space-2) text-body text-ink">
        <AlertIcon size={20} className="text-danger" />
        {message}
      </p>
      {children}
    </div>
  );
}

/** Los atributos que enlazan un control con su mensaje de error, si lo hay. */
function errorAttributes(error: string | undefined, errorId: string) {
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? errorId : undefined,
  };
}

export function TextField({
  label,
  name,
  value,
  onChange,
  maxLength,
  error,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  type?: "text" | "number";
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={FIELD_CLASS}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        {...errorAttributes(error, errorId)}
        className={SINGLE_LINE}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  value,
  onChange,
  maxLength,
  error,
  rows = 4,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  rows?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={FIELD_CLASS}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        {...errorAttributes(error, errorId)}
        className={`${FIELD_CONTROL_CLASS} min-h-(--target-min) resize-y py-(--space-3)`}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/**
 * Un selector nativo: en el móvil abre el del sistema. `V` es el tipo de los valores de
 * `options`, de modo que `onChange` entrega uno de ellos y no un `string` cualquiera.
 */
export function SelectField<V extends string = string>({
  label,
  name,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  name: string;
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (value: V) => void;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={FIELD_CLASS}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        // Solo el navegador puede entregar un valor que no esté en `options`: no los hay.
        onChange={(event) => onChange(event.target.value as V)}
        {...errorAttributes(error, errorId)}
        className={SINGLE_LINE}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
