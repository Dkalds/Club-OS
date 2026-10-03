"use client";

import { useId, useState, useTransition } from "react";
import {
  ACTION_ERROR_COPY,
  fail,
  type ActionError,
  type ActionResult,
} from "@/lib/action-result";
import { moveMethodologyItem, setMethodologyStatus } from "@/modules/methodology/actions";
import type { ContentStatus, MethodologyKind } from "@/modules/methodology/types";
import { CTAButton } from "@/ui/cta-button";
import { FieldError } from "@/ui/form-field";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const errorId = useId();

  function run(action: () => Promise<ActionResult<null>>) {
    setError(null);
    startTransition(async () => {
      let result: ActionResult<null>;
      try {
        result = await action();
      } catch {
        // La red se cae a medias o el servidor no responde: la acción lanza en vez de devolver.
        result = fail("SAVE_FAILED");
      }
      // Tras un `await`, el estado se vuelve a envolver en la transición: así el aviso y los
      // botones activos llegan en la misma pintura, y no hay un rato con el aviso y el botón parado.
      startTransition(() => setError(result.ok ? null : result.error));
    });
  }

  const move = (direction: "up" | "down") => () =>
    run(() => moveMethodologyItem(clubSlug, { kind, id, direction }));
  const setStatus = (next: ContentStatus) => () =>
    run(() => setMethodologyStatus(clubSlug, { kind, id, status: next }));

  return (
    <div className="flex flex-wrap items-center gap-(--space-2)">
      <CTAButton
        variant="ghost"
        aria-label={`Subir ${title}`}
        disabled={isFirst || pending}
        onClick={move("up")}
      >
        Subir
      </CTAButton>
      <CTAButton
        variant="ghost"
        aria-label={`Bajar ${title}`}
        disabled={isLast || pending}
        onClick={move("down")}
      >
        Bajar
      </CTAButton>
      {status === "published" ? (
        <CTAButton
          variant="secondary"
          aria-label={`Pasar a borrador ${title}`}
          disabled={pending}
          onClick={setStatus("draft")}
        >
          Pasar a borrador
        </CTAButton>
      ) : (
        <CTAButton
          variant="secondary"
          aria-label={`Publicar ${title}`}
          disabled={pending}
          onClick={setStatus("published")}
        >
          Publicar
        </CTAButton>
      )}
      {error ? (
        <div className="w-full">
          <FieldError id={errorId}>{ACTION_ERROR_COPY[error]}</FieldError>
        </div>
      ) : null}
    </div>
  );
}
