import Link from "next/link";
import type { ReactNode } from "react";
import { noTeamsState } from "@/modules/team/no-teams";
import type { ClubContext } from "@/modules/tenancy/queries";
import { Card } from "@/ui/card";
import { CheckIcon, GamesIcon, TeamIcon } from "@/ui/icons";
import { DateChip, ListRow } from "@/ui/list-row";
import { SectionHeader } from "@/ui/section-header";
import { EmptyState } from "@/ui/states";
import { AddMenu, type AddOption } from "./add-menu";
import { agendaHref } from "./href";
import { AGENDA_LIMIT } from "./limits";
import type { Agenda, AgendaFilters, AgendaItem, AgendaKind, AgendaScope } from "./types";

// Las pestañas y los filtros son enlaces (cambian la URL, no un estado del cliente) con la
// forma de los chips de `ui/filter.tsx`, como las pestañas de Sesiones (`practice-list.tsx`):
// el enlace es el área táctil de `target-min` y la píldora de 36px, lo que se ve. La activa
// sale de `aria-current` del enlace, que es el `group` de la píldora.
const CHIP_LINK = "group inline-flex min-h-(--target-min) shrink-0 items-center focus-visible:outline-hidden";
const CHIP_PILL =
  "inline-flex h-9 items-center rounded-pill border border-line bg-surface-2 px-(--space-3) " +
  "text-body-s font-semibold whitespace-nowrap text-ink-2 " +
  "group-aria-[current]:border-brand-accent group-aria-[current]:bg-brand-accent-soft " +
  "group-aria-[current]:text-brand-accent " +
  "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring";

const SCOPES: ReadonlyArray<{ scope: AgendaScope; label: string }> = [
  { scope: "upcoming", label: "Próximos" },
  { scope: "past", label: "Anteriores" },
];

const KINDS: ReadonlyArray<{ kind: AgendaKind; label: string }> = [
  { kind: "all", label: "Todo" },
  { kind: "practice", label: "Entrenos" },
  { kind: "game", label: "Partidos" },
];

/** Lo de la derecha de una fila: la hora, el marcador o cómo acabó. */
function trailOf({ trail }: AgendaItem): ReactNode {
  if (!trail) return null;
  // «Hecho» no depende solo del color: lleva el icono y la palabra.
  if (trail.tone === "done") {
    return (
      <span className="inline-flex items-center gap-(--space-1) text-success">
        <CheckIcon size={16} />
        {trail.text}
      </span>
    );
  }
  if (trail.spoken) {
    return (
      <span className="font-display text-body-strong text-ink">
        <span aria-hidden="true">{trail.text}</span>
        <span className="sr-only">{trail.spoken}</span>
      </span>
    );
  }
  return trail.text;
}

/** Qué decir cuando no hay nada en la pestaña y el filtro abiertos. */
function emptyCopy(scope: AgendaScope, kind: AgendaKind): { title: string; body: string } {
  if (scope === "past") {
    return {
      title: kind === "game" ? "Aún no hay partidos anteriores" : kind === "practice" ? "Aún no hay entrenos anteriores" : "Aún no hay nada anterior",
      body: "Lo que vaya pasando aparecerá aquí, con cómo acabó.",
    };
  }
  return {
    title: kind === "game" ? "No hay partidos programados" : kind === "practice" ? "No hay entrenos programados" : "No hay nada programado",
    body: "Cuando haya algo en el calendario, lo verás aquí.",
  };
}

/**
 * La agenda del equipo activo: «Añadir», las pestañas «Próximos» y «Anteriores», los filtros
 * por tipo y, por semanas, los entrenos y los partidos.
 *
 * Solo pinta: las semanas llegan ya armadas (`listAgenda`), con los días y las horas en la zona
 * del club (regla 7). No usa hooks: es un componente de servidor, y lo único de cliente es la
 * hoja de «Añadir». El `<h1>` de la pantalla es de la página; cada semana lleva un `<h2>`. Nada
 * de un club está escrito aquí.
 *
 * Una fila lleva a la pantalla de su evento. Las pestañas conservan el filtro de tipo y los
 * filtros conservan la pestaña. `addOptions` es lo que quien mira puede añadir: sin nada, no
 * hay botón. Sin equipos no hay nada que listar: solo el aviso, con su salida.
 */
export function AgendaList({
  clubSlug,
  filters,
  agenda,
  addOptions,
  role,
}: {
  clubSlug: string;
  filters: AgendaFilters;
  agenda: Agenda;
  addOptions: AddOption[];
  role: ClubContext["membership"]["role"];
}) {
  const { scope, kind } = filters;

  if (agenda.teamCount === 0) {
    return <EmptyState icon={<TeamIcon size={28} />} {...noTeamsState(role, clubSlug, "agenda")} />;
  }

  const empty = agenda.weeks.length === 0;
  const otherScope: AgendaScope = scope === "upcoming" ? "past" : "upcoming";

  return (
    <div className="flex flex-col gap-(--space-3)">
      <AddMenu options={addOptions} />

      <nav aria-label="Agenda" className="flex gap-(--space-2)">
        {SCOPES.map((tab) => (
          <Link
            key={tab.scope}
            href={agendaHref(clubSlug, { scope: tab.scope, kind })}
            // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
            prefetch={false}
            aria-current={tab.scope === scope ? "page" : undefined}
            className={CHIP_LINK}
          >
            <span className={CHIP_PILL}>{tab.label}</span>
          </Link>
        ))}
      </nav>

      <nav aria-label="Tipo" className="-mt-(--space-2) flex gap-(--space-2)">
        {KINDS.map((chip) => (
          <Link
            key={chip.kind}
            href={agendaHref(clubSlug, { scope, kind: chip.kind })}
            prefetch={false}
            aria-current={chip.kind === kind ? "true" : undefined}
            className={CHIP_LINK}
          >
            <span className={CHIP_PILL}>{chip.label}</span>
          </Link>
        ))}
      </nav>

      {!empty ? (
        <div className="flex flex-col gap-(--space-6) pt-(--space-2)">
          {agenda.weeks.map((week) => (
            <section key={week.key} className="flex flex-col gap-(--space-3)">
              <SectionHeader title={week.label} />
              <Card variant="flush" as="ul">
                {/* Las filas (`<li>`) van directas dentro de la lista: pintan sus separadores. */}
                {week.items.map((item) => (
                  <ListRow
                    key={item.eventId}
                    href={item.href}
                    lead={
                      scope === "past" ? (
                        <DateChip month={item.chip.label} day={item.chip.day} />
                      ) : (
                        <DateChip dow={item.chip.label} day={item.chip.day} />
                      )
                    }
                    title={item.title}
                    subtitle={item.subtitle}
                    trail={trailOf(item)}
                  />
                ))}
              </Card>
            </section>
          ))}
          {agenda.truncated ? (
            <p className="text-body-s text-ink-2">
              {scope === "upcoming"
                ? `Mostrando los ${AGENDA_LIMIT} más próximos`
                : `Mostrando los ${AGENDA_LIMIT} más recientes`}
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={<GamesIcon size={28} />}
          {...emptyCopy(scope, kind)}
          action={
            kind === "all"
              ? {
                  label: otherScope === "past" ? "Ver anteriores" : "Ver próximos",
                  href: agendaHref(clubSlug, { scope: otherScope, kind }),
                }
              : { label: "Ver todo", href: agendaHref(clubSlug, { scope, kind: "all" }) }
          }
        />
      )}
    </div>
  );
}
