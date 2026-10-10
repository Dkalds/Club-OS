import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { getTeamScope } from "@/modules/team/scope";
import type { ClubContext } from "@/modules/tenancy/queries";
import { buildAgenda } from "./build-agenda";
import { AGENDA_LIMIT } from "./limits";
import { AGENDA_COLUMNS, toAgendaEvents } from "./map-rows";
import type { Agenda, AgendaFilters, AgendaKind, AgendaScope } from "./types";

// La lectura de la Agenda. Lee con la sesión de la persona (todo pasa por RLS) y filtra siempre
// por club y por los equipos que se están viendo: las políticas ejecutan una función por fila, y
// una consulta sin filtro crecería con las filas de todos los clubes. Un error de lectura se
// registra y lanza (`throwReadError`).

/** Solo `past`, exacto, es lo anterior; cualquier otra cosa son los próximos. */
export function parseAgendaScope(value: unknown): AgendaScope {
  return value === "past" ? "past" : "upcoming";
}

/** Solo `practice` o `game`, exactos, filtran; cualquier otra cosa es todo. */
export function parseAgendaKind(value: unknown): AgendaKind {
  return value === "practice" || value === "game" ? value : "all";
}

/**
 * Los entrenos y los partidos del equipo activo (el elegido o, sin elegir, todos «mis equipos»),
 * por semanas, como mucho 50 por pestaña. `upcoming` es lo programado que no ha terminado (algo
 * en curso cuenta), del más próximo al más lejano; `past` es todo lo demás (hecho, cancelado y
 * programado que ya terminó), del más reciente al más antiguo. `kind` deja solo los entrenos o
 * solo los partidos.
 *
 * `nowIso` es el instante actual del servidor en ISO: nunca llega de la petición, porque va
 * dentro del filtro. Las semanas, los días y las horas salen en la zona del club.
 */
export async function listAgenda(ctx: ClubContext, { scope, kind }: AgendaFilters, nowIso: string): Promise<Agenda> {
  const { scoped } = await getTeamScope(ctx);
  if (scoped.length === 0) return { weeks: [], teamCount: 0, truncated: false };

  const supabase = await createClient();

  const events = supabase
    .from("events")
    .select(AGENDA_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .in(
      "team_id",
      scoped.map((team) => team.id),
    );
  const ofKind = kind === "all" ? events : events.eq("kind", kind);
  // Lo anterior es lo que no es «programado y sin terminar»: se pide con la negación.
  const inScope =
    scope === "upcoming"
      ? ofKind.eq("status", "scheduled").gt("ends_at", nowIso)
      : ofKind.or(`status.neq.scheduled,ends_at.lte.${nowIso}`);

  // Uno de más, para saber si hay más de los que se enseñan.
  const { data, error } = await inScope
    .order("starts_at", { ascending: scope === "upcoming" })
    .order("id", { ascending: true })
    .limit(AGENDA_LIMIT + 1);
  if (error) throwReadError("schedule.agenda", error);

  const truncated = data.length > AGENDA_LIMIT;
  const rows = truncated ? data.slice(0, AGENDA_LIMIT) : data;

  return {
    weeks: buildAgenda(toAgendaEvents(rows), scoped, {
      scope,
      nowIso,
      tz: ctx.org.timezone,
      clubSlug: ctx.org.slug,
    }),
    teamCount: scoped.length,
    truncated,
  };
}
