"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { setActiveTeam } from "@/modules/team/actions";
import { BottomSheet } from "./bottom-sheet";
import { FormAlert } from "./form-field";
import { CheckIcon, ChevronDownIcon } from "./icons";

export type TeamSwitcherTeam = { id: string; name: string };

/** Lo que se ve cuando no hay un equipo elegido. */
const ALL_LABEL = "Todos";
const ALL_OPTION = "Todos mis equipos";

// Cada opción es una fila de `target-min` de alto, como las del menú de cuenta. El foco va
// por dentro: la hoja recorta sus esquinas.
const OPTION =
  "flex min-h-(--target-min) w-full cursor-pointer items-center justify-between gap-(--space-3) " +
  "px-(--space-4) text-left text-body-strong text-ink hover:bg-surface-3 active:bg-surface-3 " +
  "disabled:cursor-default aria-pressed:text-brand-accent " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * El selector del equipo activo, en la cabecera: una píldora con el nombre del equipo que se
 * está viendo (o «Todos») que abre una hoja con «mis equipos». Lo elegido vale para toda la
 * app (Inicio, Agenda, Sesiones y Equipo) y se recuerda (`setActiveTeam`).
 *
 * Quien lo monta decide si se pinta: solo tiene sentido con más de un equipo. La píldora es el
 * área táctil de `target-min` y lo que se ve mide 36px, como los chips de `Filter`. Un nombre
 * largo se trunca: la cabecera nunca ensancha la pantalla.
 *
 * Al elegir, la hoja se queda abierta con sus opciones paradas hasta que el servidor contesta;
 * si va bien se cierra y la pantalla se vuelve a pedir (`router.refresh`), y si no, lo dice ahí
 * mismo. Elegir el que ya está activo solo cierra la hoja.
 */
export function TeamSwitcher({
  clubSlug,
  teams,
  activeId,
}: {
  clubSlug: string;
  teams: TeamSwitcherTeam[];
  /** El equipo que se está viendo, o `null` si se ven todos. */
  activeId: string | null;
}) {
  const router = useRouter();
  const choosing = useAction();
  const [open, setOpen] = useState(false);

  const active = teams.find((team) => team.id === activeId) ?? null;
  const current = active?.name ?? ALL_LABEL;

  function choose(teamId: string | null) {
    if (teamId === (active?.id ?? null)) {
      setOpen(false);
      return;
    }
    choosing.run(
      () => setActiveTeam(clubSlug, { teamId }),
      () => {
        setOpen(false);
        router.refresh();
      },
    );
  }

  return (
    <>
      <button
        type="button"
        // El nombre empieza por lo que se ve (WCAG 2.5.3) y dice para qué sirve.
        aria-label={`${current}. Cambiar de equipo`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="group inline-flex min-h-(--target-min) min-w-0 shrink cursor-pointer items-center focus-visible:outline-hidden"
      >
        <span className="inline-flex h-9 max-w-40 min-w-0 items-center gap-(--space-1) rounded-pill border border-line bg-surface-2 pr-(--space-2) pl-(--space-3) text-body-s font-semibold text-ink group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus-ring">
          <span className="truncate">{current}</span>
          <ChevronDownIcon size={16} className="text-ink-2" />
        </span>
      </button>

      <BottomSheet open={open} onOpenChange={setOpen} title="Equipo">
        {choosing.failure ? (
          <div className="px-(--space-4) pb-(--space-2)">
            <FormAlert message={ACTION_ERROR_COPY[choosing.failure.error]} />
          </div>
        ) : null}
        <ul role="list" className="pb-(--space-2)">
          <li>
            <button
              type="button"
              className={OPTION}
              aria-pressed={active === null}
              disabled={choosing.pending}
              onClick={() => choose(null)}
            >
              <span className="min-w-0 wrap-break-word">{ALL_OPTION}</span>
              {active === null ? <CheckIcon /> : null}
            </button>
          </li>
          {teams.map((team) => (
            <li key={team.id} className="border-t border-line">
              <button
                type="button"
                className={OPTION}
                aria-pressed={team.id === active?.id}
                disabled={choosing.pending}
                onClick={() => choose(team.id)}
              >
                <span className="min-w-0 wrap-break-word">{team.name}</span>
                {team.id === active?.id ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
