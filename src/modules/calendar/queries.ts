import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  SCHEDULE_COLUMNS,
  TEAM_SCHEDULES_COLUMNS,
  toSeasonSchedules,
  toTeamScheduleList,
  toVenue,
  VENUE_COLUMNS,
} from "./map-rows";
import type { TeamSchedule, TeamSchedules, Venue } from "./types";

// Lecturas del calendario del club. Se filtra siempre por `organization_id`; quién ve qué lo
// decide RLS: las pistas, cualquier miembro del club; los horarios, la dirección y el cuerpo
// técnico de cada equipo.

/** Las pistas del club, por nombre, con los equipos que tienen algún horario en cada una. */
export async function listVenues(ctx: ClubContext): Promise<Venue[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("venues")
    .select(VENUE_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("calendar.venues", error);

  // La base ordena por bytes; la lista, como se lee en español.
  return data.map(toVenue).sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id));
}

/**
 * Los nombres de las pistas del club: lo que sugiere «Lugar» en el formulario de una sesión o
 * de un partido. Una lectura aparte, sin recuentos: la pide quien entrena.
 */
export async function listVenueNames(ctx: ClubContext): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("venues").select("name").eq("organization_id", ctx.org.id);
  if (error) throwReadError("calendar.venue-names", error);

  return data.map((row) => row.name).sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Los horarios semanales de un equipo del club, de lunes a domingo. Vacío si el id no tiene
 * forma de uuid (llega de la URL: ni se consulta) o el equipo no es de este club.
 */
export async function listTeamSchedules(ctx: ClubContext, teamId: string): Promise<TeamSchedule[]> {
  if (!UUID_RE.test(teamId)) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("team_schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("team_id", teamId);
  if (error) throwReadError("calendar.team-schedules", error);

  return toTeamScheduleList(data);
}

/** Los equipos de la temporada actual, cada uno con sus horarios (también los que no tienen). */
export async function listSeasonSchedules(ctx: ClubContext): Promise<TeamSchedules[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_SCHEDULES_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("seasons.is_current", true);
  if (error) throwReadError("calendar.season-schedules", error);

  return toSeasonSchedules(data);
}
