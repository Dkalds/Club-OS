import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  STAFF_TEAM_COLUMNS,
  TEAM_COLUMNS,
  TEAM_DETAIL_COLUMNS,
  toStaffTeamSummaries,
  toTeamDetail,
  toTeamSummaries,
} from "./map-rows";
import type { TeamDetail, TeamSummary } from "./types";

// «Mis equipos»: la única definición de qué equipos ve cada persona, que usan Equipo,
// Entrenar, Partidos e Inicio. Siempre de la temporada actual. Leen con la sesión de la
// persona (RLS) y filtran siempre por club.

/** Los equipos de la temporada actual de cuyo cuerpo técnico es la persona. */
export async function listStaffTeams(orgId: string, personId: string): Promise<TeamSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("team_staff")
    .select(STAFF_TEAM_COLUMNS)
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .eq("teams.seasons.is_current", true);
  if (error) throwReadError("team.staff-teams", error);

  return toStaffTeamSummaries(data);
}

async function clubTeams(orgId: string): Promise<TeamSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_COLUMNS)
    .eq("organization_id", orgId)
    .eq("seasons.is_current", true);
  if (error) throwReadError("team.club-teams", error);

  return toTeamSummaries(data);
}

/**
 * Los equipos de la temporada actual de quien tiene este contexto: todos los del club para la
 * dirección y, para el resto, los de su cuerpo técnico. Sin persona asociada (y sin ser
 * dirección) no hay ninguno, y ni se consulta.
 */
export async function listMyTeams(ctx: ClubContext): Promise<TeamSummary[]> {
  const { role, personId } = ctx.membership;

  if (role === "admin") return clubTeams(ctx.org.id);
  if (!personId) return [];
  return listStaffTeams(ctx.org.id, personId);
}

/**
 * Un equipo de la temporada actual con su cuerpo técnico y su plantilla. `null` si el id no
 * es válido, no es del club, es de otra temporada o RLS no lo deja ver: la página responde
 * con un 404 que no distingue entre esos casos.
 */
export async function getTeam(ctx: ClubContext, teamId: string): Promise<TeamDetail | null> {
  if (!UUID_RE.test(teamId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_DETAIL_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", teamId)
    .eq("seasons.is_current", true)
    .maybeSingle();
  if (error) throwReadError("team.detail", error);

  return data ? toTeamDetail(data) : null;
}
