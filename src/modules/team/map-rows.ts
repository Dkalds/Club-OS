import type { TeamDetail, TeamPlayer, TeamStaffMember, TeamSummary } from "./types";

// De las filas que devuelve PostgREST a los tipos del módulo. Funciones puras, aparte para
// probarlas sin base de datos.
//
// Las claves foráneas son compuestas (`organization_id`, x_id): una relación embebida puede
// llegar como objeto o como lista de un elemento. Aquí se lee igual en los dos casos.
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ── Columnas ─────────────────────────────────────────────────────────────────────────

/**
 * Un equipo con su categoría y su temporada. El `!inner` con el filtro sobre
 * `seasons.is_current` deja solo los de la temporada actual: «mis equipos» no incluye
 * temporadas pasadas.
 */
export const TEAM_COLUMNS = "id, name, categories(name, sort), seasons!inner(name, is_current)";

/** Los equipos de una persona por su cuerpo técnico, con el mismo filtro de temporada. */
export const STAFF_TEAM_COLUMNS = `teams!inner(${TEAM_COLUMNS})`;

/** Un equipo con su cuerpo técnico y su plantilla. */
export const TEAM_DETAIL_COLUMNS = `${TEAM_COLUMNS},
  team_staff(staff_role, people(id, first_name, last_name)),
  team_players(jersey_number, position, people(id, first_name, last_name))`;

// ── Filas ────────────────────────────────────────────────────────────────────────────

export type TeamRow = {
  id: string;
  name: string;
  categories: Embedded<{ name: string; sort: number }>;
  seasons: Embedded<{ name: string; is_current?: boolean }>;
};

export type StaffTeamRow = { teams: Embedded<TeamRow> };

type PersonRow = { id: string; first_name: string; last_name: string };

export type TeamDetailRow = TeamRow & {
  team_staff: Array<{ staff_role: TeamStaffMember["role"]; people: Embedded<PersonRow> }> | null;
  team_players: Array<{
    jersey_number: number | null;
    position: string | null;
    people: Embedded<PersonRow>;
  }> | null;
};

const byText = (a: string, b: string) => a.localeCompare(b, "es");
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function toSummary(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    categoryName: one(row.categories)?.name ?? "",
    seasonName: one(row.seasons)?.name ?? "",
  };
}

function categorySort(row: TeamRow): number {
  return one(row.categories)?.sort ?? Number.MAX_SAFE_INTEGER;
}

/** Por el orden de su categoría, después por nombre y, a igual nombre, por id. */
export function toTeamSummaries(rows: TeamRow[]): TeamSummary[] {
  return [...rows]
    .sort((a, b) => categorySort(a) - categorySort(b) || byText(a.name, b.name) || byId(a.id, b.id))
    .map(toSummary);
}

/** Los equipos de las filas del cuerpo técnico; una fila sin equipo no cuenta. */
export function toStaffTeamSummaries(rows: StaffTeamRow[]): TeamSummary[] {
  return toTeamSummaries(rows.flatMap((row) => one(row.teams) ?? []));
}

/**
 * La plantilla por dorsal (sin dorsal al final, por apellido) y el cuerpo técnico con el
 * principal primero. Una persona que RLS no deja ver llega a null y no se cuenta.
 */
export function toTeamDetail(row: TeamDetailRow): TeamDetail {
  const summary = toSummary(row);

  const players: TeamPlayer[] = (row.team_players ?? []).flatMap((player) => {
    const person = one(player.people);
    if (!person) return [];
    return {
      personId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      jerseyNumber: player.jersey_number,
      position: player.position,
    };
  });
  players.sort(
    (a, b) =>
      (a.jerseyNumber ?? Number.MAX_SAFE_INTEGER) - (b.jerseyNumber ?? Number.MAX_SAFE_INTEGER) ||
      byText(a.lastName, b.lastName) ||
      byText(a.firstName, b.firstName),
  );

  const roleOrder: Record<TeamStaffMember["role"], number> = { head_coach: 0, assistant: 1 };
  const staff: TeamStaffMember[] = (row.team_staff ?? []).flatMap((member) => {
    const person = one(member.people);
    if (!person) return [];
    return {
      personId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      role: member.staff_role,
    };
  });
  staff.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || byText(a.lastName, b.lastName));

  return { ...summary, players, staff };
}
