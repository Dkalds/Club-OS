import type { ReactNode } from "react";
import type { PlayerGoal } from "@/modules/development/types";
import { StandardBadge } from "./standard-badge";

/**
 * Un objetivo de un jugador (design/components/GoalItem). Es un `<li>` de la lista de objetivos
 * de la ficha. Enseña qué se trabaja (regla 8): el Standard ligado y el foco, si los tiene.
 * Uno activo no dice estado; uno logrado, cuándo; uno archivado, que lo está. Las acciones
 * (editar, lograr, archivar) las pone quien puede hacerlas.
 */
export function GoalItem({ goal, actions }: { goal: PlayerGoal; actions?: ReactNode }) {
  const status =
    goal.status === "achieved" && goal.achievedOn
      ? `Logrado el ${goal.achievedOn.charAt(0).toLowerCase()}${goal.achievedOn.slice(1)}`
      : goal.status === "archived"
        ? "Archivado"
        : null;

  return (
    <li className="flex flex-col gap-(--space-2) border-t border-line px-(--space-4) py-(--space-3) first:border-t-0">
      <p className="text-body-strong">{goal.title}</p>
      {goal.description ? <p className="text-body-s text-ink-2">{goal.description}</p> : null}
      {goal.standard || goal.focus ? (
        <div className="flex flex-wrap items-center gap-(--space-2)">
          {goal.standard ? <StandardBadge number={goal.standard.number} title={goal.standard.title} /> : null}
          {goal.focus ? <span className="text-label text-ink-3 uppercase">{goal.focus.name}</span> : null}
        </div>
      ) : null}
      {status ? <p className="text-body-s text-ink-3">{status}</p> : null}
      {actions ? <div className="flex flex-wrap gap-(--space-2)">{actions}</div> : null}
    </li>
  );
}
