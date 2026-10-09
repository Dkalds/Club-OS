import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { listStaffTeams } from "@/modules/team/queries";
import type { ClubContext } from "@/modules/tenancy/queries";
import { buildHome } from "./build-home";
import { toHomeEvents } from "./map-rows";
import type { HomeData } from "./types";

/** Eventos que se leen para armar Inicio: de sobra para «Esta semana» y el próximo entreno. */
const EVENT_LIMIT = 30;

const EVENT_COLUMNS = `id, team_id, kind, status, starts_at, ends_at, location,
  practice_plans(
    title,
    primary_focus:focus_areas!practice_plans_organization_id_primary_focus_id_fkey(name),
    secondary_focus:focus_areas!practice_plans_organization_id_secondary_focus_id_fkey(name),
    practice_items(sort, minutes)
  ),
  games(opponent_name, competition_name, home_away)`;

/**
 * Los datos de Inicio de quien tiene la sesión: su nombre, sus equipos y los eventos de
 * esos equipos que aún no han terminado.
 *
 * Lee con la sesión de la persona (todo pasa por RLS) y filtra siempre por club y por
 * equipos: las políticas de RLS ejecutan una función por fila, y una consulta sin filtro
 * crecería con las filas de todos los clubes. Las horas salen en la zona del club.
 * Con cualquier error de lectura, lanza (`throwReadError`: lo registra y no lo convierte en
 * datos vacíos).
 */
export async function getHomeData(ctx: ClubContext, nowIso: string): Promise<HomeData> {
  const { personId } = ctx.membership;
  const tz = ctx.org.timezone;

  // Una cuenta sin persona asociada (por ejemplo, quien solo administra) no entrena a nadie.
  if (!personId) return buildHome({ firstName: "", teams: [], events: [] }, nowIso, tz);

  const supabase = await createClient();
  const orgId = ctx.org.id;

  const [person, myTeams] = await Promise.all([
    supabase
      .from("people")
      .select("first_name")
      .eq("organization_id", orgId)
      .eq("id", personId)
      .maybeSingle(),
    // Los equipos de su cuerpo técnico de esta temporada («mis equipos»).
    listStaffTeams(orgId, personId),
  ]);
  if (person.error) throwReadError("home.person", person.error);

  const firstName = person.data?.first_name ?? "";
  const teams = myTeams
    .map(({ id, name, seasonName }) => ({ id, name, seasonName }))
    .sort((a, b) => a.name.localeCompare(b.name, "es") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (teams.length === 0) return buildHome({ firstName, teams, events: [] }, nowIso, tz);

  // `practice_plans` y `games` cuelgan de `events` por claves compuestas: llegan como lista
  // de un elemento. Los dos focos del plan apuntan a la misma tabla, y cada uno lleva el
  // nombre de su clave foránea para que PostgREST sepa cuál es cuál.
  //
  // El próximo partido se pide aparte: con `EVENT_LIMIT` un mes con muchos entrenamientos
  // dejaría fuera un partido que aún está lejos, y la tarjeta de Inicio no saldría.
  const upcoming = () =>
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("organization_id", orgId)
      .in(
        "team_id",
        teams.map((team) => team.id),
      )
      .eq("status", "scheduled")
      .gt("ends_at", nowIso);

  const [events, nextGame] = await Promise.all([
    upcoming().order("starts_at", { ascending: true }).order("id", { ascending: true }).limit(EVENT_LIMIT),
    upcoming().eq("kind", "game").order("starts_at", { ascending: true }).order("id", { ascending: true }).limit(1),
  ]);
  if (events.error) throwReadError("home.events", events.error);
  if (nextGame.error) throwReadError("home.next-game", nextGame.error);

  const seen = new Set(events.data.map((event) => event.id));
  const rows = [...events.data, ...nextGame.data.filter((event) => !seen.has(event.id))];

  return buildHome({ firstName, teams, events: toHomeEvents(rows) }, nowIso, tz);
}
