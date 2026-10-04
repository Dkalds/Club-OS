"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CloseIcon, SearchIcon } from "./icons";

/**
 * El nombre accesible del campo: el placeholder sin los puntos suspensivos finales
 * («Buscar ejercicios…» → «Buscar ejercicios»), que es como lo escribe design/components/Search
 * en su `aria-label`. Un lector de pantalla leería los puntos.
 */
function accessibleName(placeholder: string): string {
  return placeholder.replace(/\s*(…|\.{3})$/, "");
}

/**
 * El campo de búsqueda de la biblioteca (design/components/Search), siempre encima de los
 * filtros. La búsqueda la resuelve el servidor, dentro del club; este componente solo avisa.
 *
 * `onSearch` recibe el texto tal cual, sin recortar (eso lo interpreta quien filtra), una sola
 * vez por pausa: `debounceMs` (250 por defecto) después de la última pulsación. No avisa al
 * montarse, ni con `defaultValue`, y tampoco si el texto vuelve a ser el de la última
 * búsqueda (escribir una letra y borrarla dentro de la pausa no hace nada). Siempre se llama a
 * la última función `onSearch` que llegó, no a la del primer render, y al desmontarse se
 * cancela lo pendiente.
 *
 * - Vaciar el campo (con el teclado, con Escape o con el botón) busca «» para que la lista se
 *   restablezca. «Borrar búsqueda» lo hace al momento, sin esperar, y devuelve el foco al campo.
 * - Intro busca al momento, sin esperar la pausa, y no envía ningún formulario que lo contenga.
 *   No cierra el teclado del móvil: el foco se queda donde está.
 *
 * El campo enseña `defaultValue` y después lleva su propio texto: si quien lo monta quiere
 * restablecerlo desde fuera (el «limpiar filtros» de una lista vacía), lo remonta con otra
 * `key`. Altura `target-min`, fondo `surface-2`, borde `line-strong`, icono `ink-3`. El botón
 * de borrar propio sustituye al nativo de `type="search"`, que en un fondo oscuro es casi
 * invisible y no llega a 44px.
 */
export function Search({
  placeholder,
  defaultValue = "",
  onSearch,
  debounceMs = 250,
}: {
  placeholder: string;
  defaultValue?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
}) {
  const [text, setText] = useState(defaultValue);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSent = useRef(defaultValue);
  const latestOnSearch = useRef(onSearch);

  // Siempre la última función, sin volver a armar el temporizador cada vez que cambia.
  useEffect(() => {
    latestOnSearch.current = onSearch;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  function send(query: string) {
    clearTimeout(timer.current);
    if (query === lastSent.current) return;
    lastSent.current = query;
    latestOnSearch.current(query);
  }

  function change(query: string) {
    setText(query);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(query), debounceMs);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    send(event.currentTarget.value);
  }

  function clear() {
    setText("");
    send("");
    input.current?.focus();
  }

  return (
    <div role="search" className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label={accessibleName(placeholder)}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(event) => change(event.target.value)}
        onKeyDown={onKeyDown}
        className={`h-(--target-min) w-full rounded-md border border-line-strong bg-surface-2 pl-11 text-body text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-search-cancel-button]:appearance-none ${
          text ? "pr-(--target-min)" : "pr-(--space-4)"
        }`}
      />
      {text ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={clear}
          className="absolute inset-y-0 right-0 flex w-(--target-min) cursor-pointer items-center justify-center rounded-md text-ink-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
        >
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}
