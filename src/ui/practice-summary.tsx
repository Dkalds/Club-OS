import type { ReactNode } from "react";
import { practiceMeta, statusLabel } from "@/modules/practice/format";
import type { FocusOption, PracticeDetail, PracticeStatus } from "@/modules/practice/types";
import { CheckIcon, CloseIcon } from "./icons";

// Sin `"use client"` ni hooks: se pinta en el servidor, en el detalle de una sesión y en su
// editor.

/** El icono y el color de cada estado que no es lo normal; con la palabra al lado, nunca solo. */
const STATUS_STYLE: Partial<Record<PracticeStatus, { icon: ReactNode; className: string }>> = {
  done: { icon: <CheckIcon size={16} />, className: "text-success" },
  cancelled: { icon: <CloseIcon size={16} />, className: "text-danger" },
};

/**
 * La cabecera de una sesión de entrenamiento: de qué equipo es, cuándo, cómo se llama, cuánto
 * dura y qué trabaja. Es lo que se lee antes de la lista de ítems, en el detalle y en el editor.
 *
 * Mismo orden que `PracticeCard`: el equipo como kicker (sin equipo, no se pinta), la franja
 * (`slotLabel`, que llega ya en la zona del club), el título —el `<h1>` de la pantalla—, los
 * metadatos (`practiceMeta`) y los objetivos. Los objetivos son el «por qué» de la sesión
 * (regla 8): el principal primero, el secundario después, y sin ninguno no hay lista: no se
 * inventan. Una sesión programada no lleva estado; una hecha o cancelada lo dice con su
 * palabra y un icono, en `success` y `danger`.
 *
 * Medidas de las etiquetas (12px, 24px de alto) de design/components/bundle.css.
 */
export function PracticeSummary({
  practice,
}: {
  practice: Pick<
    PracticeDetail,
    "teamName" | "slotLabel" | "title" | "location" | "status" | "primaryFocus" | "secondaryFocus"
  > & { totalMinutes: number; itemCount: number };
}) {
  const { teamName, slotLabel, title, location, status, totalMinutes, itemCount } = practice;
  const goals = [practice.primaryFocus, practice.secondaryFocus].filter(
    (goal): goal is FocusOption => goal !== null,
  );
  const statusText = statusLabel(status);
  const statusStyle = STATUS_STYLE[status];

  return (
    <header className="flex flex-col gap-(--space-2)">
      {teamName ? <p className="text-label text-ink-2 uppercase">{teamName}</p> : null}
      <p className="text-body-strong tabular-nums">{slotLabel}</p>
      <h1 className="font-display text-display-l wrap-break-word uppercase">{title}</h1>
      <p className="text-body-s text-ink-2 tabular-nums">
        {practiceMeta({ totalMinutes, itemCount, location })}
      </p>
      {statusText && statusStyle ? (
        <p className={`flex items-center gap-(--space-2) text-body-strong ${statusStyle.className}`}>
          {statusStyle.icon}
          {statusText}
        </p>
      ) : null}
      {goals.length > 0 ? (
        <ul aria-label="Objetivos" className="flex flex-wrap gap-(--space-2)">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="inline-flex min-h-6 items-center rounded-xs border border-line-strong px-(--space-2) text-[12px] leading-4 font-semibold text-ink"
            >
              {goal.name}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
