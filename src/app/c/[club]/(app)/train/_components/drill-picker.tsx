"use client";

import { useEffect, useState } from "react";
import { MAX_QUERY_LENGTH } from "@/modules/drills/filters";
import type { DrillSummary, FocusArea } from "@/modules/drills/types";
import { findDrills } from "@/modules/practice/actions";
import { MAX_ITEMS } from "@/modules/practice/limits";
import { BottomSheet } from "@/ui/bottom-sheet";
import { DrillCard } from "@/ui/drill-card";
import { Filter } from "@/ui/filter";
import { CheckIcon, SearchIcon, TrainIcon } from "@/ui/icons";
import { Search } from "@/ui/search";
import { EmptyState, ErrorState, LoadingState } from "@/ui/states";

const LIMIT_REACHED = `Una sesión tiene como máximo ${MAX_ITEMS} ejercicios.`;

/** Lo que se busca: el texto y el objetivo (su slug), cada uno solo si está puesto. */
type Filters = { q?: string; focus?: string };

/**
 * Una petición de la lista. Cada cambio de búsqueda o de objetivo, cada «Reintentar» y cada
 * apertura de la hoja es una nueva, con su número: la respuesta lleva el de la que la pidió, y
 * solo vale la de la última.
 */
type Request = { id: number; filters: Filters };

/** La respuesta a la petición `id`: los ejercicios, o `null` si no se pudieron cargar. */
type Outcome = { id: number; drills: DrillSummary[] | null };

// El botón de «Añadir» de cada fila mide `target-min` y se ve de 36px, como los chips de
// `Filter` y los de minutos de `PracticeItem`: el botón es el área y la píldora de dentro, lo
// que se ve. Es una acción de fila repetida decenas de veces, así que no es un `CTAButton`
// (a cuyo relleno de 20px a cada lado le sobra casi toda la fila). Con la sesión llena se
// apaga como los botones desactivados del sistema. El anillo de foco va por dentro de la
// píldora: la lista llega a los bordes de la hoja y recortaría lo que sobresale.
const ADD_BUTTON =
  "group inline-flex min-h-(--target-min) min-w-(--target-min) cursor-pointer items-center justify-center focus-visible:outline-hidden disabled:cursor-default";
const ADD_PILL =
  "inline-flex h-9 items-center gap-(--space-1) rounded-pill border px-(--space-3) text-body-s font-semibold whitespace-nowrap " +
  "group-active:bg-surface-3 group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring " +
  "group-disabled:border-transparent group-disabled:bg-surface-2 group-disabled:text-ink-3";

/**
 * El selector de ejercicios del constructor de una sesión: una hoja inferior «Añadir
 * ejercicio» con la biblioteca del club, para añadir uno o varios a la sesión sin salir de ella.
 *
 * Es de cliente y pide los ejercicios a la acción `findDrills` (solo publicados, de este club):
 * al abrirse, la primera página sin búsqueda ni objetivo, y después lo que pidan el buscador y
 * el filtro «Objetivo» (sus opciones son los `focusAreas` del club, más el «Todos» del propio
 * filtro). Mientras llega la lista se ve su esqueleto; si no llega, un aviso con «Reintentar»; y
 * si no hay nada, lo dice con el motivo. La petición vigente es la última: una respuesta que
 * llega después de que se pidiera otra cosa, o con la hoja ya cerrada, se descarta (el efecto
 * la marca como vieja al limpiarse), así que una lenta nunca pisa a una más nueva.
 *
 * Elegir no cierra la hoja: `onPick` recibe el ejercicio, la fila pasa a «Añadido» y se puede
 * seguir. El botón sigue activo (volver a tocarlo lo añade otra vez, que es legítimo: dos
 * bloques del mismo ejercicio), y un aviso de estado, que siempre está en el árbol, lo dice a
 * quien no ve la pantalla. Cerrar y volver a abrir parte de cero: sin filtros, sin marcas y con
 * la primera página, porque lo añadido ya está en la lista del constructor.
 *
 * El cuerpo de cada fila es un enlace a la ficha del ejercicio (`DrillCard`), y la acción de la
 * derecha queda fuera de él. Con `full` (la sesión ya lleva el máximo de ejercicios) los
 * botones se desactivan y la hoja dice por qué.
 */
export function DrillPicker({
  clubSlug,
  focusAreas,
  open,
  onOpenChange,
  onPick,
  full = false,
}: {
  clubSlug: string;
  focusAreas: FocusArea[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (drill: DrillSummary) => void;
  full?: boolean;
}) {
  const [request, setRequest] = useState<Request>({ id: 0, filters: {} });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");

  // Reabrir parte de cero. Se ajusta durante el render, cuando cambia `open`
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // un efecto pintaría primero la lista y las marcas de la vez anterior.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRequest((current) => ({ id: current.id + 1, filters: {} }));
      setAdded(new Set());
      setAnnouncement("");
    }
  }

  // Pide la lista de la petición vigente. Al cambiar la petición o cerrar la hoja, la limpieza
  // marca la anterior como vieja y su respuesta, si llega, no se guarda.
  useEffect(() => {
    if (!open) return;

    let stale = false;
    findDrills(clubSlug, request.filters)
      .then(
        (result): Outcome => ({ id: request.id, drills: result.ok ? result.data : null }),
        (): Outcome => ({ id: request.id, drills: null }),
      )
      .then((next) => {
        if (!stale) setOutcome(next);
      });

    return () => {
      stale = true;
    };
  }, [open, clubSlug, request]);

  /** Una petición nueva con los filtros cambiados; un texto vacío o un objetivo `null` los quitan. */
  function refine(change: { q: string } | { focus: string | null }) {
    setRequest(({ id, filters }) => {
      const next: Filters = { ...filters };
      if ("q" in change) {
        if (change.q === "") delete next.q;
        else next.q = change.q;
      } else if (change.focus === null) {
        delete next.focus;
      } else {
        next.focus = change.focus;
      }
      return { id: id + 1, filters: next };
    });
  }

  function retry() {
    setRequest(({ id, filters }) => ({ id: id + 1, filters }));
  }

  function pick(drill: DrillSummary) {
    onPick(drill);
    setAdded((current) => new Set(current).add(drill.id));
    setAnnouncement(`${drill.title} añadido a la sesión.`);
  }

  const loading = outcome === null || outcome.id !== request.id;
  const drills = loading ? null : outcome.drills;
  const filtered = request.filters.q !== undefined || request.filters.focus !== undefined;
  const base = `/c/${clubSlug}`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Añadir ejercicio">
      <div className="flex flex-col gap-(--space-3) pb-(--space-4)">
        <div className="flex flex-col gap-(--space-3) px-(--space-4)">
          <Search placeholder="Buscar ejercicios…" maxLength={MAX_QUERY_LENGTH} onSearch={(q) => refine({ q })} />
          <Filter
            label="Objetivo"
            options={focusAreas.map((area) => ({ value: area.slug, label: area.name }))}
            value={request.filters.focus ?? null}
            onChange={(focus) => refine({ focus })}
          />
          {/* Siempre en el árbol y vacía hasta que se añade algo: un lector de pantalla solo anuncia el texto que cambia en una región que ya existía. */}
          <p role="status" className="sr-only">
            {announcement}
          </p>
          {full ? <p className="text-body-s text-ink-2">{LIMIT_REACHED}</p> : null}
        </div>

        {loading ? (
          <div className="px-(--space-4)">
            <LoadingState rows={4} />
          </div>
        ) : drills === null ? (
          <div className="px-(--space-4)">
            <ErrorState title="No se pudieron cargar los ejercicios" body="Inténtalo de nuevo." onRetry={retry} />
          </div>
        ) : drills.length === 0 ? (
          <div className="px-(--space-4)">
            {filtered ? (
              <EmptyState
                icon={<SearchIcon size={28} />}
                title="No hay ejercicios con esta búsqueda"
                body="Prueba con otro nombre o con otro objetivo."
              />
            ) : (
              <EmptyState
                icon={<TrainIcon size={28} />}
                title="Aún no hay ejercicios publicados"
                body="Cuando dirección publique ejercicios, los verás aquí."
              />
            )}
          </div>
        ) : (
          // Las filas van directas dentro del contenedor: así `DrillCard` pinta sus separadores.
          <div className="border-t border-line">
            {drills.map((drill) => {
              const done = added.has(drill.id);

              return (
                <DrillCard
                  key={drill.id}
                  drill={drill}
                  href={`${base}/drills/${drill.id}`}
                  action={
                    <button
                      type="button"
                      // Con la fila ya añadida, el nombre empieza por lo que se ve («Añadido») y dice qué hace otro toque.
                      aria-label={done ? `Añadido. Volver a añadir ${drill.title}` : `Añadir ${drill.title}`}
                      disabled={full}
                      onClick={() => pick(drill)}
                      className={ADD_BUTTON}
                    >
                      <span
                        className={`${ADD_PILL} ${done ? "border-success text-success" : "border-line-strong text-ink"}`}
                      >
                        {done ? <CheckIcon size={16} /> : null}
                        {done ? "Añadido" : "Añadir"}
                      </span>
                    </button>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
