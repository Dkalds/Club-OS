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
 * `defaultValue` es el valor con el que arranca el campo y, después, el que traen de fuera
 * (la URL de la lista): el campo lo sigue cuando cambia.
 * - Si es justo la última búsqueda del campo (la vuelta normal de lo que ha escrito quien busca,
 *   que sale al servidor y regresa por la URL), no se toca nada: ni el valor, ni el cursor, ni
 *   el foco, aunque quien busca ya haya seguido escribiendo.
 * - Si es otra cosa (el enlace «Quitar filtros» de la lista vacía, atrás y adelante del
 *   navegador), GANA lo de fuera, incluso sobre un texto que se estaba escribiendo y aún no se
 *   había buscado: el campo lo muestra, lo da por buscado (no llama a `onSearch`) y cancela
 *   lo pendiente. Quien cambia la URL lo hace a propósito. Por eso la pantalla no necesita
 *   una `key` que remonte el campo: remontarlo en cada búsqueda le quitaría el foco a quien
 *   está escribiendo.
 *
 * Altura `target-min`, fondo `surface-2`, borde `line-strong`, icono `ink-3`. El texto es de
 * 17px (`body-l`, como los demás campos): por debajo de 16px iOS amplía la página al enfocar.
 * El botón de borrar propio sustituye al nativo de `type="search"`, que en un fondo oscuro es
 * casi invisible y no llega a 44px.
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
  // Lo último que se buscó: con él se decide si un texto o un `defaultValue` son novedad.
  const [sent, setSent] = useState(defaultValue);
  const [followed, setFollowed] = useState(defaultValue);
  const input = useRef<HTMLInputElement>(null);
  const latestOnSearch = useRef(onSearch);

  // Siempre la última función, sin volver a armar el temporizador cada vez que cambia.
  useEffect(() => {
    latestOnSearch.current = onSearch;
  });

  // Ajustar el estado cuando cambia una prop se hace durante el render
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // un efecto pintaría primero el texto viejo. Al cambiar `text` y `sent`, el efecto de abajo
  // limpia su temporizador y no arma otro.
  if (defaultValue !== followed) {
    setFollowed(defaultValue);
    if (defaultValue !== sent) {
      setText(defaultValue);
      setSent(defaultValue);
    }
  }

  // El debounce: cada pulsación cancela el temporizador anterior (la limpieza del efecto) y
  // arma otro. Con el texto igual a lo ya buscado no hay nada que esperar.
  useEffect(() => {
    if (text === sent) return;

    const timer = setTimeout(() => {
      latestOnSearch.current(text);
      setSent(text);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [text, sent, debounceMs]);

  // Buscar ya, sin esperar la pausa. Al cambiar `sent`, el efecto cancela lo pendiente.
  function searchNow(query: string) {
    if (query === sent) return;
    latestOnSearch.current(query);
    setSent(query);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchNow(event.currentTarget.value);
  }

  function clear() {
    setText("");
    searchNow("");
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
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className={`h-(--target-min) w-full rounded-md border border-line-strong bg-surface-2 pl-11 text-body-l text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-search-cancel-button]:appearance-none ${
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
