import Link from "next/link";
import type { ReactNode } from "react";
import { drillMeta } from "@/modules/drills/format";
import type { DrillSummary } from "@/modules/drills/types";
import { CourtThumb } from "./court-thumb";
import { FilterTag } from "./filter-tag";
import { DraftIcon } from "./icons";

/**
 * Un ejercicio como fila de una lista (design/components/DrillCard): la biblioteca y, más
 * adelante, el selector del Practice Builder. Va dentro de una `Card` `flush`, con las filas
 * directas, para que pinte sus separadores.
 *
 * Enseña la miniatura (la pista vacía: las listas no cargan diagramas), el título en
 * `font-display`, los metadatos («U12+ · 6–12 jug. · 10–15 min», de `drillMeta`) y la etiqueta
 * de su primer objetivo. Un borrador lo dice con «Borrador», con su icono; archivado o
 * publicado no llevan nada. `DrillSummary` no trae los Standards ni los principios que
 * trabaja el ejercicio: la fila enseña su objetivo y el «por qué» (regla 8) está en la ficha.
 *
 * La fila entera es un único enlace a `href`, así que es su área táctil. `action` (el
 * «Añadir» del selector) va a la derecha, FUERA del enlace: un botón dentro de un `<a>` no es
 * HTML válido y su toque no debe abrir la ficha. Es quien lo pasa quien le da sus 44px.
 *
 * Es un componente de servidor y se repite una vez por ejercicio: por eso solo importa módulos
 * sin `"use client"` (`./court-thumb`, `./filter-tag`, no `./court` ni `./filter`, que traen los
 * componentes de cliente y, con ellos, la hoja inferior y Radix). Un test recorre su grafo de
 * importaciones y lo vigila. La miniatura es decorativa: no se cargan diagramas en las listas y
 * su nombre se leería delante del título en cada fila.
 *
 * Pulsada, la parte enlazada pasa a `surface-3`, y `ink-3` no va sobre `surface-3`
 * (design/README.md, Color): los metadatos suben a `ink-2` mientras dura la pulsación. El foco va
 * por dentro: la card recorta lo que sobresale. Un título largo se recorta a dos líneas.
 */
export function DrillCard({
  drill,
  href,
  action,
}: {
  drill: DrillSummary;
  href: string;
  action?: ReactNode;
}) {
  const focus = drill.focus[0];
  const isDraft = drill.status === "draft";

  return (
    <div className="flex items-center border-t border-line first:border-t-0">
      <Link
        href={href}
        // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
        prefetch={false}
        className="group flex min-w-0 flex-1 items-center gap-(--space-3) px-(--space-4) py-(--space-3) text-ink active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      >
        <CourtThumb decorative />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 font-display text-title font-bold wrap-break-word uppercase">
            {drill.title}
          </span>
          <span className="text-body-s text-ink-3 group-active:text-ink-2">{drillMeta(drill)}</span>
          {focus || isDraft ? (
            <span className="flex flex-wrap items-center gap-(--space-2)">
              {focus ? <FilterTag>{focus.name}</FilterTag> : null}
              {isDraft ? (
                <FilterTag>
                  <DraftIcon size={16} />
                  Borrador
                </FilterTag>
              ) : null}
            </span>
          ) : null}
        </span>
      </Link>
      {action ? <div className="shrink-0 pr-(--space-4)">{action}</div> : null}
    </div>
  );
}
