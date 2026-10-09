import type { ReactNode } from "react";
import type { CoachNote } from "@/modules/development/types";

/**
 * Una nota del cuerpo técnico sobre un jugador (design/components/NoteItem). Es un `<li>` de la
 * lista de notas de la ficha. El texto respeta sus saltos de línea; debajo, quién la escribió,
 * cuándo, si se editó, y quién la puede leer («Solo yo» o «Cuerpo técnico»). Solo su autor la
 * edita o la borra: las acciones las pone quien la pinta, si es suya.
 */
export function NoteItem({ note, actions }: { note: CoachNote; actions?: ReactNode }) {
  const meta = [note.authorName ?? "Dirección", note.writtenOn, ...(note.edited ? ["Editada"] : [])].join(" · ");

  return (
    <li className="flex flex-col gap-(--space-2) border-t border-line px-(--space-4) py-(--space-3) first:border-t-0">
      <p className="text-body whitespace-pre-line wrap-anywhere">{note.body}</p>
      <div className="flex flex-wrap items-center justify-between gap-(--space-2)">
        <p className="text-body-s text-ink-3">{meta}</p>
        <span className="rounded-pill border border-line px-(--space-2) text-caption text-ink-2">
          {note.visibility === "private" ? "Solo yo" : "Cuerpo técnico"}
        </span>
      </div>
      {actions ? <div className="flex flex-wrap gap-(--space-2)">{actions}</div> : null}
    </li>
  );
}
