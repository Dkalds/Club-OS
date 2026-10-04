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
 *
 * Con `focus={false}` no se lleva el foco, y se anuncia igual: es para el aviso general de un
 * formulario que ya lleva el foco al primer campo que falla («Revisa los campos marcados.»),
 * donde dos avisos disputándose el foco dejarían a quien guarda en el que no es.
 */
export function FormAlert({
  message,
  focus = true,
  children,
}: {
  message: string;
  focus?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus) ref.current?.focus();
    // Solo al montarse: el formulario lo monta de nuevo en cada fallo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

/**
 * Los atributos que enlazan un control con su pista y con su mensaje de error, si los hay. La
 * pista va primero: es lo que se lee siempre; el error, además, cuando ha fallado.
 */
function errorAttributes(error: string | undefined, errorId: string, hintId?: string) {
  const described = [hintId, error ? errorId : undefined].filter(Boolean).join(" ");

  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": described || undefined,
  };
}

/** La pista de un campo («Separa con comas.»): lo que ayuda a rellenarlo, siempre a la vista. */
function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-body-s text-ink-3">
      {children}
    </p>
  );
}

type TextFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Una línea de ayuda bajo el campo, que lo describe además de su etiqueta. */
  hint?: string;
} & (
  | { type?: "text"; maxLength: number; min?: never; max?: never }
  | { type: "number"; maxLength?: number; min?: number; max?: number }
);

/**
 * Un campo de una línea. De texto exige `maxLength`: todo texto que se guarda tiene tope. De
 * tipo número no lo exige (el navegador ignora `maxlength` en un número) y admite `min` y
 * `max`, que son lo que ese campo puede decir de su rango.
 */
export function TextField({
  label,
  name,
  value,
  onChange,
  maxLength,
  min,
  max,
  error,
  hint,
  type = "text",
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

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
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        {...errorAttributes(error, errorId, hint ? hintId : undefined)}
        className={SINGLE_LINE}
      />
      {hint ? <Hint id={hintId}>{hint}</Hint> : null}
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
  hint,
  rows = 4,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  /** Una línea de ayuda bajo el área, que la describe además de su etiqueta. */
  hint?: string;
  rows?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

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
        {...errorAttributes(error, errorId, hint ? hintId : undefined)}
        className={`${FIELD_CONTROL_CLASS} min-h-(--target-min) resize-y py-(--space-3)`}
      />
      {hint ? <Hint id={hintId}>{hint}</Hint> : null}
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
