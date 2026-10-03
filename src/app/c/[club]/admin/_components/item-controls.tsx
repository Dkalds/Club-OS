"use client";

import { useEffect, useId, useRef } from "react";
import { ACTION_ERROR_COPY, type ActionResult } from "@/lib/action-result";
import { moveMethodologyItem, setMethodologyStatus } from "@/modules/methodology/actions";
import type { ContentStatus, MethodologyKind } from "@/modules/methodology/types";
import { CTAButton } from "@/ui/cta-button";
import { FieldError } from "@/ui/form-field";
import { useAction } from "./use-action";

type Control = "up" | "down" | "status";

/** A qué botón vuelve el foco tras usar cada control: primero él mismo y, si no se puede, su pareja. */
const FOCUS_ORDER: Record<Control, readonly Control[]> = {
  up: ["up", "down"],
  down: ["down", "up"],
  status: ["status"],
};

/**
 * Los controles de una fila de Gestión: subir, bajar y publicar o pasar a borrador («archivar»:
 * nada se borra). Sirve a las cuatro listas de la metodología (`kind`); no sabe de qué es la fila.
 *
 * «Subir» y «Bajar» se desactivan en los extremos de la lista (`isFirst`, `isLast`: la lista
 * entera, borradores incluidos, que es la que ve dirección). Mientras una acción corre, todos
 * esperan: un segundo toque no lanza otra. Las acciones revalidan Gestión al terminar bien, y
 * eso repinta la lista con el orden y el estado nuevos; aquí solo se enseña si fallan.
 *
 * Los nombres accesibles llevan el título de la fila («Subir {title}»): sin él, una lista de
 * seis filas sería seis botones «Subir» iguales.
 *
 * El foco: mientras la acción corre los botones se desactivan y el navegador suelta el foco
 * (queda en `<body>`), y al repintarse la lista la fila cambia de sitio. Quien usa el teclado
 * perdería su lugar tras cada toque. Al terminar, el foco vuelve a lo que se usó; si ese botón
 * ya no se puede usar (la fila llegó al extremo), al otro de la pareja.
 */
export function ItemControls({
  clubSlug,
  kind,
  id,
  title,
  status,
  isFirst,
  isLast,
}: {
  clubSlug: string;
  kind: MethodologyKind;
  id: string;
  title: string;
  status: ContentStatus;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, failure, run } = useAction();
  const errorId = useId();
  const root = useRef<HTMLDivElement>(null);
  const refocus = useRef<Control | null>(null);

  // `pending` pasa a falso en la misma pintura que trae la lista nueva: aquí ya están los
  // botones con su estado definitivo.
  useEffect(() => {
    if (pending || refocus.current === null) return;
    const used = refocus.current;
    refocus.current = null;

    for (const control of FOCUS_ORDER[used]) {
      const button = root.current?.querySelector<HTMLButtonElement>(
        `[data-control="${control}"]:not(:disabled)`,
      );
      if (button) {
        button.focus();
        return;
      }
    }
  }, [pending]);

  function press(control: Control, action: () => Promise<ActionResult<null>>) {
    refocus.current = control;
    run(action);
  }

  // Solo las acciones: `press` las lanza desde el manejador de cada botón, que es donde se
  // toca el foco pendiente (un ref no se lee ni se escribe al pintar).
  const moveUp = () => moveMethodologyItem(clubSlug, { kind, id, direction: "up" });
  const moveDown = () => moveMethodologyItem(clubSlug, { kind, id, direction: "down" });
  const publish = () => setMethodologyStatus(clubSlug, { kind, id, status: "published" });
  const archive = () => setMethodologyStatus(clubSlug, { kind, id, status: "draft" });

  // Con un error, los botones lo describen: un lector de pantalla lo lee tras el nombre del que se
  // enfoca (el error se anuncia al aparecer, `role="alert"`, pero el foco vuelve a un botón).
  const describedBy = failure ? errorId : undefined;

  return (
    <div ref={root} className="flex flex-wrap items-center gap-(--space-2)">
      <CTAButton
        variant="ghost"
        data-control="up"
        aria-label={`Subir ${title}`}
        aria-describedby={describedBy}
        disabled={isFirst || pending}
        onClick={() => press("up", moveUp)}
      >
        Subir
      </CTAButton>
      <CTAButton
        variant="ghost"
        data-control="down"
        aria-label={`Bajar ${title}`}
        aria-describedby={describedBy}
        disabled={isLast || pending}
        onClick={() => press("down", moveDown)}
      >
        Bajar
      </CTAButton>
      {status === "published" ? (
        <CTAButton
          variant="secondary"
          data-control="status"
          aria-label={`Pasar a borrador ${title}`}
          aria-describedby={describedBy}
          disabled={pending}
          onClick={() => press("status", archive)}
        >
          Pasar a borrador
        </CTAButton>
      ) : (
        <CTAButton
          variant="secondary"
          data-control="status"
          aria-label={`Publicar ${title}`}
          aria-describedby={describedBy}
          disabled={pending}
          onClick={() => press("status", publish)}
        >
          Publicar
        </CTAButton>
      )}
      {failure ? (
        <div className="w-full">
          <FieldError id={errorId}>{ACTION_ERROR_COPY[failure.error]}</FieldError>
        </div>
      ) : null}
    </div>
  );
}
