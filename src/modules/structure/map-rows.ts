import { byListName } from "./format";
import type {
  AdminPlayer,
  AdminStaffMember,
  AdminTeam,
  Category,
  OrgRole,
  PersonDetail,
  PersonSummary,
  PersonTeam,
  SeasonDetail,
  SeasonSummary,
  SeasonTeam,
  StaffRole,
} from "./types";

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

/** El recuento de una relación embebida como `tabla(count)`. */
function count(value: Array<{ count: number }> | null | undefined): number {
  return value?.[0]?.count ?? 0;
}

const STAFF_ORDER: Record<StaffRole, number> = { head_coach: 0, assistant: 1 };

// ── Columnas ─────────────────────────────────────────────────────────────────────────

export const SEASON_COLUMNS = "id, name, starts_on, ends_on, is_current";

export const SEASON_TEAM_COLUMNS =
  "id, name, category_id, categories(name, sort), team_players(count), team_staff(count)";

export const CATEGORY_COLUMNS = "id, name, age_band, sort, teams(count)";

export const ADMIN_TEAM_COLUMNS = `id, name, category_id, categories(name), seasons(${SEASON_COLUMNS}),
  team_staff(staff_role, people(id, first_name, last_name)),
  team_players(jersey_number, position, people(id, first_name, last_name, birth_year))`;

/** Un equipo de una persona: su nombre y su temporada. */
const PERSON_TEAM = "teams(id, name, seasons(name, is_current, starts_on))";

export const PERSON_COLUMNS = `id, first_name, last_name, birth_year, archived_at,
  team_players(${PERSON_TEAM}),
  team_staff(staff_role, ${PERSON_TEAM})`;

export const PERSON_DETAIL_COLUMNS = `${PERSON_COLUMNS}, memberships(role, status)`;

// ── Filas ────────────────────────────────────────────────────────────────────────────

export type SeasonRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
};

export type SeasonTeamRow = {
  id: string;
  name: string;
  category_id: string;
  categories: Embedded<{ name: string; sort: number }>;
  team_players: Array<{ count: number }> | null;
  team_staff: Array<{ count: number }> | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  age_band: string;
  sort: number;
  teams: Array<{ count: number }> | null;
};

type PersonNameRow = { id: string; first_name: string; last_name: string };

export type AdminTeamRow = {
  id: string;
  name: string;
  category_id: string;
  categories: Embedded<{ name: string }>;
  seasons: Embedded<SeasonRow>;
  team_staff: Array<{ staff_role: StaffRole; people: Embedded<PersonNameRow> }> | null;
  team_players: Array<{
    jersey_number: number | null;
    position: string | null;
    people: Embedded<PersonNameRow & { birth_year: number | null }>;
  }> | null;
};

type PersonTeamRow = {
  teams: Embedded<{
    id: string;
    name: string;
    seasons: Embedded<{ name: string; is_current: boolean; starts_on: string }>;
  }>;
};

export type PersonRow = PersonNameRow & {
  birth_year: number | null;
  archived_at: string | null;
  team_players: PersonTeamRow[] | null;
  team_staff: Array<PersonTeamRow & { staff_role: StaffRole }> | null;
};

export type PersonDetailRow = PersonRow & {
  memberships: Array<{ role: OrgRole; status: string }> | null;
};

// ── Conversiones ─────────────────────────────────────────────────────────────────────

export function toSeasonSummary(row: SeasonRow): SeasonSummary {
  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isCurrent: row.is_current,
  };
}

/** Los equipos de una temporada: por el orden de su categoría y, dentro, por nombre. */
export function toSeasonTeams(rows: readonly SeasonTeamRow[]): SeasonTeam[] {
  return rows
    .map((row) => {
      const category = one(row.categories);
      return {
        id: row.id,
        name: row.name,
        categoryId: row.category_id,
        categoryName: category?.name ?? "",
        categorySort: category?.sort ?? 0,
        players: count(row.team_players),
        staff: count(row.team_staff),
      };
    })
    .sort(
      (a, b) =>
        a.categorySort - b.categorySort ||
        a.categoryName.localeCompare(b.categoryName, "es") ||
        a.name.localeCompare(b.name, "es") ||
        a.id.localeCompare(b.id),
    );
}

export function toSeasonDetail(row: SeasonRow, teams: readonly SeasonTeamRow[]): SeasonDetail {
  return { ...toSeasonSummary(row), teams: toSeasonTeams(teams) };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    ageBand: row.age_band,
    sort: row.sort,
    inUse: count(row.teams) > 0,
  };
}

/** Un equipo con su gente: el cuerpo técnico, el principal primero; la plantilla, por dorsal. */
export function toAdminTeam(row: AdminTeamRow): AdminTeam | null {
  const season = one(row.seasons);
  if (!season) return null;

  const staff: AdminStaffMember[] = [];
  for (const member of row.team_staff ?? []) {
    const person = one(member.people);
    if (!person) continue;
    staff.push({
      personId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      role: member.staff_role,
    });
  }
  staff.sort((a, b) => STAFF_ORDER[a.role] - STAFF_ORDER[b.role] || byListName(a, b));

  const players: AdminPlayer[] = [];
  for (const seat of row.team_players ?? []) {
    const person = one(seat.people);
    if (!person) continue;
    players.push({
      personId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      birthYear: person.birth_year,
      jerseyNumber: seat.jersey_number,
      position: seat.position,
    });
  }
  // Sin dorsal, al final.
  players.sort((a, b) => (a.jerseyNumber ?? 100) - (b.jerseyNumber ?? 100) || byListName(a, b));

  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: one(row.categories)?.name ?? "",
    season: toSeasonSummary(season),
    staff,
    players,
  };
}

/** Los equipos de una persona, de cualquier temporada: la actual primero, luego las más recientes. */
function personTeams(row: PersonRow): Array<PersonTeam & { startsOn: string }> {
  const teams: Array<PersonTeam & { startsOn: string }> = [];

  const push = (seat: PersonTeamRow, as: PersonTeam["as"]) => {
    const team = one(seat.teams);
    const season = team ? one(team.seasons) : null;
    if (!team || !season) return;
    teams.push({
      teamId: team.id,
      teamName: team.name,
      seasonName: season.name,
      isCurrent: season.is_current,
      as,
      startsOn: season.starts_on,
    });
  };
  for (const seat of row.team_staff ?? []) push(seat, seat.staff_role);
  for (const seat of row.team_players ?? []) push(seat, "player");

  return teams.sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      b.startsOn.localeCompare(a.startsOn) ||
      a.teamName.localeCompare(b.teamName, "es") ||
      a.teamId.localeCompare(b.teamId),
  );
}

export function toPersonSummary(row: PersonRow): PersonSummary {
  const current = personTeams(row)
    .filter((team) => team.isCurrent)
    .map((team) => team.teamName);

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthYear: row.birth_year,
    archived: row.archived_at !== null,
    // Quien entrena y juega en el mismo equipo lo lleva una vez.
    teams: [...new Set(current)],
  };
}

export function toPersonDetail(row: PersonDetailRow): PersonDetail {
  const active = (row.memberships ?? []).find((membership) => membership.status === "active");

  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthYear: row.birth_year,
    archived: row.archived_at !== null,
    teams: personTeams(row).map(({ teamId, teamName, seasonName, isCurrent, as }) => ({
      teamId,
      teamName,
      seasonName,
      isCurrent,
      as,
    })),
    access: active?.role ?? null,
  };
}
