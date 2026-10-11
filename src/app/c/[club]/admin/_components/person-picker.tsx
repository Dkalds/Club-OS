"use client";

import { useEffect, useId, useRef, useState } from "react";
import { listName, matchesPerson } from "@/modules/structure/format";
import { FIELD_CONTROL_CLASS, FIELD_LABEL_CLASS, FieldError } from "@/ui/form-field";

/** Lo que el buscador necesita de una persona. De un menor, solo el año. */
export type PickablePerson = { id: string; firstName: string; lastName: string; birthYear: number | null };

/** Cuántas personas se enseñan como mucho bajo el buscador: con más, se afina la búsqueda. */
const MAX_RESULTS = 8;

const RESULT =
  "flex min-h-(--target-min) w-full cursor-pointer items-center justify-between gap-(--space-3) px-(--space-3) text-left " +
  "text-body text-ink active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * Elegir a una persona del club escribiendo parte de su nombre. Mientras no hay nadie elegido es
 * un campo de búsqueda con sus resultados debajo (hasta `MAX_RESULTS`); elegida una, enseña su
 * nombre con «Cambiar». `people` son las candidatas: quien lo monta ya ha quitado a las
 * archivadas y a las que no pueden elegirse.
 *
 * La búsqueda no distingue tildes ni mayúsculas, y es local: la lista viaja con la página.
 *
 * Al elegir a alguien o al pulsar «Cambiar», lo que tenía el foco desaparece: se lleva a lo que
 * lo sustituye («Cambiar», o el campo), para que quien va con teclado no vuelva al principio.
 */
export function PersonPicker({
  label,
  people,
  value,
  onChange,
  error,
}: {
  label: string;
  people: readonly PickablePerson[];
  value: string | null;
  onChange: (personId: string | null) => void;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const change = useRef<HTMLButtonElement>(null);
  // Solo cuando el cambio sale de aquí: si quien lo monta vacía la elección, el foco es suyo.
  const refocus = useRef(false);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (value ? change.current : input.current)?.focus();
  }, [value]);

  const selected = value ? (people.find((person) => person.id === value) ?? null) : null;
  const searching = query.trim() !== "";
  const matches = searching ? people.filter((person) => matchesPerson(person, query)) : [];

  if (selected) {
    return (
      <div className="flex flex-col gap-(--space-2)">
        <p className={FIELD_LABEL_CLASS}>{label}</p>
        <div className="flex items-center justify-between gap-(--space-3)">
          <p className="min-w-0 truncate text-body-strong">{listName(selected)}</p>
          <button
            ref={change}
            type="button"
            onClick={() => {
              setQuery("");
              refocus.current = true;
              onChange(null);
            }}
            className="inline-flex min-h-(--target-min) shrink-0 cursor-pointer items-center rounded-sm px-(--space-2) text-body-s font-semibold text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Cambiar
          </button>
        </div>
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-(--space-2)">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="search"
        value={query}
        maxLength={80}
        autoComplete="off"
        placeholder="Escribe un nombre"
        onChange={(event) => setQuery(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${FIELD_CONTROL_CLASS} h-(--target-min)`}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {searching ? (
        matches.length > 0 ? (
          <>
            <ul role="list" aria-label={`Resultados de ${label.toLowerCase()}`} className="overflow-hidden rounded-md border border-line">
              {matches.slice(0, MAX_RESULTS).map((person) => (
                <li key={person.id} className="border-t border-line first:border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      // Elegida, la búsqueda ya no hace falta: si se suelta a la persona (o se añade
                      // y el buscador vuelve a empezar), no queda un texto viejo buscando.
                      setQuery("");
                      refocus.current = true;
                      onChange(person.id);
                    }}
                    className={RESULT}
                  >
                    <span className="min-w-0 truncate">{listName(person)}</span>
                    {person.birthYear ? (
                      <span className="shrink-0 text-body-s text-ink-2 tabular-nums">{person.birthYear}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {matches.length > MAX_RESULTS ? (
              <p className="text-body-s text-ink-2">{`Hay ${matches.length} personas. Escribe algo más para afinar.`}</p>
            ) : null}
          </>
        ) : (
          <p role="status" className="text-body-s text-ink-2">
            Nadie con ese nombre. Si es alguien nuevo, dalo de alta.
          </p>
        )
      ) : null}
    </div>
  );
}
