"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AGE_OPTIONS,
  filterHref,
  MAX_QUERY_LENGTH,
  MINUTE_OPTIONS,
  PLAYER_OPTIONS,
  parseDrillFilters,
} from "@/modules/drills/filters";
import { formatAge } from "@/modules/drills/format";
import type { DrillFilters, FocusArea } from "@/modules/drills/types";
import { Chip, Filter, FilterRow, FilterSheetChip, type FilterOption } from "@/ui/filter";
import { CloseIcon } from "@/ui/icons";
import { Search } from "@/ui/search";

type Patch = Parameters<typeof filterHref>[2];

/**
 * Los números que ofrece un chip de hoja, como opciones de `FilterSheetChip` (su `value` es
 * texto). Si la URL trae un valor que no es una de ellas (`?age=13`), se suma en su sitio: el
 * filtro está puesto aunque ningún chip lo ofrezca, y la hoja tiene que enseñarlo marcado para
 * que se vea qué filtra la lista y se pueda quitar.
 */
function numberOptions(
  offered: readonly number[],
  active: number | undefined,
  label: (value: number) => string,
): FilterOption[] {
  const values =
    active === undefined || offered.includes(active) ? offered : [...offered, active].sort((a, b) => a - b);

  return values.map((value) => ({ value: String(value), label: label(value) }));
}

/** Una categoría concreta es un rango de un solo número: «U12». */
const ageLabel = (age: number) => formatAge(age, age);
const playersLabel = (players: number) => `${players} jug.`;
const minutesLabel = (minutes: number) => `${minutes} min`;

/**
 * Los filtros que quedan tras aplicar `patch`, leídos como los leerá el servidor de la URL a la
 * que se va (`parseDrillFilters` sobre lo que escribe `filterHref`): así lo que enseña la barra
 * es exactamente lo que la página va a recibir.
 */
function applyPatch(current: DrillFilters, patch: Patch): DrillFilters {
  const query = filterHref("", current, patch).replace(/^\?/, "");

  return parseDrillFilters(Object.fromEntries(new URLSearchParams(query)));
}

/**
 * Buscador y filtros de la biblioteca, siempre sobre la lista. Es lo único de cliente de la
 * pantalla: la página (servidor) lee los filtros de la URL, busca y pinta la lista, y esta barra
 * solo cambia la URL.
 *
 * Cada control navega con `router.replace(filterHref(…), { scroll: false })` dentro de una
 * transición: la URL es el estado (se comparte, funciona con Atrás y recarga), `replace` no
 * llena el historial con una entrada por pulsación y la lista no salta arriba. Mientras llega
 * la respuesta, la barra se queda ocupada (`aria-busy`) y no se bloquea.
 *
 * Los chips se marcan al pulsarlos, sin esperar al servidor: `target` son los filtros a los que
 * va la URL. Además de dar respuesta al toque, es lo que evita perder un cambio: una segunda
 * pulsación antes de que vuelva la primera partiría de los `filters` viejos (los de la página
 * anterior) y su URL soltaría el filtro recién puesto. Cuando llega la página, manda ella: sus
 * `filters` sustituyen a `target` (también con Atrás y Adelante).
 *
 * El campo de búsqueda recibe `filters.q` tal cual lo lee la página, sin `key` (ver `Search`:
 * remontarlo en cada búsqueda le quitaría el foco a quien teclea) y con el tope de su lector.
 *
 * Un filtro de la URL que no se puede nombrar sigue a la vista, para poder quitarlo: una edad,
 * unos jugadores o unos minutos fuera de las opciones salen en su chip; un objetivo que el club
 * no tiene, como un chip más (con su slug); un principio sin título (no existe o no está
 * publicado), con su slug. Si no, la lista quedaría vacía sin explicación.
 */
export function DrillFiltersBar({
  filters,
  focusAreas,
  principleTitle,
}: {
  filters: DrillFilters;
  focusAreas: FocusArea[];
  principleTitle: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // Ajustar el estado cuando cambia una prop se hace durante el render
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [seen, setSeen] = useState(filters);
  const [target, setTarget] = useState(filters);
  if (filters !== seen) {
    setSeen(filters);
    setTarget(filters);
  }

  function go(patch: Patch) {
    const href = filterHref(pathname, target, patch);
    setTarget(applyPatch(target, patch));
    startTransition(() => router.replace(href, { scroll: false }));
  }

  const focusOptions: FilterOption[] = focusAreas.map((area) => ({ value: area.slug, label: area.name }));
  if (target.focus !== undefined && !focusOptions.some((option) => option.value === target.focus)) {
    focusOptions.push({ value: target.focus, label: target.focus });
  }

  return (
    <div aria-busy={pending} className="flex flex-col gap-(--space-3)">
      <Search
        placeholder="Buscar ejercicios…"
        defaultValue={filters.q ?? ""}
        maxLength={MAX_QUERY_LENGTH}
        onSearch={(q) => go({ q })}
      />
      <Filter
        label="Objetivo"
        options={focusOptions}
        value={target.focus ?? null}
        onChange={(focus) => go({ focus: focus ?? undefined })}
      />
      <FilterRow label="Edad, jugadores y duración">
        <FilterSheetChip
          label="Edad"
          title="Edad"
          options={numberOptions(AGE_OPTIONS, target.age, ageLabel)}
          value={target.age === undefined ? null : String(target.age)}
          onChange={(age) => go({ age: age ?? undefined })}
        />
        <FilterSheetChip
          label="Jugadores"
          title="Jugadores"
          options={numberOptions(PLAYER_OPTIONS, target.players, playersLabel)}
          value={target.players === undefined ? null : String(target.players)}
          onChange={(players) => go({ players: players ?? undefined })}
        />
        <FilterSheetChip
          label="Duración"
          title="Duración"
          options={numberOptions(MINUTE_OPTIONS, target.minutes, minutesLabel)}
          value={target.minutes === undefined ? null : String(target.minutes)}
          onChange={(minutes) => go({ minutes: minutes ?? undefined })}
        />
      </FilterRow>
      {target.principle !== undefined ? (
        // En su fila: tras los tres chips de arriba quedaría fuera de la pantalla, y es un
        // filtro que vacía la lista sin que se vea de dónde viene.
        <FilterRow label="Principio">
          <Chip pressed label="Quitar filtro de principio" onClick={() => go({ principle: undefined })}>
            Principio: {principleTitle ?? target.principle}
            <CloseIcon size={16} />
          </Chip>
        </FilterRow>
      ) : null}
    </div>
  );
}
