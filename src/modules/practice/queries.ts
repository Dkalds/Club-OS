import { can } from "@/lib/permissions";
import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  DETAIL_COLUMNS,
  LIST_COLUMNS,
  STAFF_TEAM_COLUMNS,
  TEAM_COLUMNS,
  toPracticeDetail,
  toPracticeListItems,
  toStaffTeamOptions,
  toTeamOptions,
} from "./map-rows";
import type { FocusOption, PracticeDetail, PracticeListItem, TeamOption } from "./types";

// Lecturas de las sesiones de entrenamiento para quien entrena.
//
// Todas leen con la sesión de la persona (todo pasa por RLS) y filtran siempre por club, además
// de por equipos o por id: las políticas de RLS ejecutan una función por fila, y una consulta
// sin filtro crecería con las filas de todos los clubes. Un error de lectura no se traga ni se
// convierte en datos vacíos o en «no existe»: se registra y lanza (`throwReadError`), y lo
// recoge el error de la página. Las columnas, el paso de fila a tipo y las horas en la zona del
// club son de `map-rows.ts`.

/** Las sesiones que como mucho enseña cada pestaña de la lista. */
const LIST_LIMIT = 50;

async function adminTeams(orgId: string): Promise<TeamOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_COLUMNS)
    .eq("organization_id", orgId)
    .eq("seasons.is_current", true);
  if (error) throwReadError("practice.teams", error);

  return toTeamOptions(data);
}

async function staffTeams(orgId: string, personId: string): Promise<TeamOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("team_staff")
    .select(STAFF_TEAM_COLUMNS)
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .eq("teams.seasons.is_current", true);
  if (error) throwReadError("practice.teams", error);

  return toStaffTeamOptions(data);
}

/**
 * Los equipos de la temporada actual donde la sesión puede planificar, por nombre: todos los
 * del club para la dirección y, para el resto, los de cuyo cuerpo técnico es su persona. Sin
 * persona asociada (y sin ser dirección) no hay ninguno, y ni se consulta.
 */
export async function listManageableTeams(ctx: ClubContext): Promise<TeamOption[]> {
  const { role, personId } = ctx.membership;

  if (role === "admin") return adminTeams(ctx.org.id);
  if (!personId) return [];
  return staffTeams(ctx.org.id, personId);
}

/** Los objetivos de trabajo del club, en su orden. */
async function getFocusAreas(ctx: ClubContext): Promise<FocusOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("focus_areas")
    .select("id, name")
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("practice.focus-areas", error);

  return data.map((row) => ({ id: row.id, name: row.name }));
}

/** Lo que ofrece el formulario de una sesión para elegir: los equipos gestionables y los objetivos del club. */
export async function getPracticeFormOptions(
  ctx: ClubContext,
): Promise<{ teams: TeamOption[]; focusAreas: FocusOption[] }> {
  const [teams, focusAreas] = await Promise.all([listManageableTeams(ctx), getFocusAreas(ctx)]);

  return { teams, focusAreas };
}

/**
 * Los entrenamientos de los equipos gestionables, como mucho 50 por pestaña. `upcoming` son los
 * programados que no han terminado (uno en curso cuenta), del más próximo al más lejano;
 * `history` es todo lo demás (hechos, cancelados y programados que ya terminaron), del más
 * reciente al más antiguo. `teamCount` es cuántos equipos puede gestionar la sesión: sin
 * ninguno, el estado vacío ni consulta los eventos.
 *
 * `nowIso` es el instante actual del servidor en ISO. Las horas salen en la zona del club.
 */
export async function listPractices(
  ctx: ClubContext,
  scope: "upcoming" | "history",
  nowIso: string,
): Promise<{ practices: PracticeListItem[]; teamCount: number; truncated: boolean }> {
  const teams = await listManageableTeams(ctx);
  if (teams.length === 0) return { practices: [], teamCount: 0, truncated: false };

  const supabase = await createClient();

  // `practice_plans` cuelga de `events` por una clave compuesta: llega como lista de un
  // elemento. El histórico es lo que no es «programado y sin terminar»: se pide con la
  // negación de esa condición. Se pide un elemento extra para saber si hay más de LIST_LIMIT.
  const events = supabase
    .from("events")
    .select(LIST_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("kind", "practice")
    .in(
      "team_id",
      teams.map((team) => team.id),
    );
  const scoped =
    scope === "upcoming"
      ? events.eq("status", "scheduled").gt("ends_at", nowIso)
      : events.or(`status.neq.scheduled,ends_at.lte.${nowIso}`);

  const { data, error } = await scoped
    .order("starts_at", { ascending: scope === "upcoming" })
    .order("id", { ascending: true })
    .limit(LIST_LIMIT + 1);
  if (error) throwReadError("practice.list", error);

  const truncated = data.length > LIST_LIMIT;
  const rows = truncated ? data.slice(0, LIST_LIMIT) : data;

  return {
    practices: toPracticeListItems(rows, teams, ctx.org.timezone),
    teamCount: teams.length,
    truncated,
  };
}

/**
 * El entrenamiento de un evento, entero, para el detalle y el constructor. `null` si el id no
 * es un uuid (sin consultar nada), si la fila no llega (no existe, es de otro club o RLS no la
 * deja ver, sin distinguir un caso del otro) o si el evento no tiene plan: quien llama responde
 * con el mismo 404. Si Supabase falla, lanza.
 *
 * No filtra por equipos gestionables: eso es de RLS (el plan solo lo ven la dirección y el
 * cuerpo técnico de su equipo), y así una sesión de una temporada pasada sigue abriéndose.
 */
export async function getPractice(ctx: ClubContext, eventId: string): Promise<PracticeDetail | null> {
  if (!UUID_RE.test(eventId)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", eventId)
    .eq("kind", "practice")
    .maybeSingle();
  if (error) throwReadError("practice.detail", error);
  if (!data) return null;

  return toPracticeDetail(data, {
    timezone: ctx.org.timezone,
    canManage: can(ctx, "practice.manage"),
  });
}
