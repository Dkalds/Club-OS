import { bySlot, timeLabel } from "./format";
import type { TeamSchedule, TeamSchedules, Venue } from "./types";

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

export const VENUE_COLUMNS = "id, name, team_schedules(teams(name))";

export const SCHEDULE_COLUMNS = "id, team_id, weekday, start_time, duration_minutes, venue_id, venues(name)";

/** Un equipo con su categoría y sus horarios. El `!inner` deja solo los de la temporada actual. */
export const TEAM_SCHEDULES_COLUMNS = `id, name, categories(name, sort), seasons!inner(is_current),
  team_schedules(${SCHEDULE_COLUMNS})`;

// ── Filas ────────────────────────────────────────────────────────────────────────────

export type VenueRow = {
  id: string;
  name: string;
  team_schedules: Array<{ teams: Embedded<{ name: string }> }> | null;
};

export type ScheduleRow = {
  id: string;
  team_id: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  venue_id: string | null;
  venues: Embedded<{ name: string }>;
};

export type TeamSchedulesRow = {
  id: string;
  name: string;
  categories: Embedded<{ name: string; sort: number }>;
  team_schedules: ScheduleRow[] | null;
};

// ── Conversiones ─────────────────────────────────────────────────────────────────────

export function toVenue(row: VenueRow): Venue {
  const teams = new Set<string>();
  for (const schedule of row.team_schedules ?? []) {
    const team = one(schedule.teams);
    if (team) teams.add(team.name);
  }

  return { id: row.id, name: row.name, usedBy: [...teams].sort((a, b) => a.localeCompare(b, "es")) };
}

export function toTeamSchedule(row: ScheduleRow): TeamSchedule {
  return {
    id: row.id,
    teamId: row.team_id,
    weekday: row.weekday,
    startTime: timeLabel(row.start_time),
    durationMinutes: row.duration_minutes,
    venueId: row.venue_id,
    venueName: one(row.venues)?.name ?? null,
  };
}

/** Los horarios de un equipo, de lunes a domingo y por hora. */
export function toTeamScheduleList(rows: readonly ScheduleRow[]): TeamSchedule[] {
  return rows.map(toTeamSchedule).sort(bySlot);
}

/** Los equipos con sus horarios: por el orden de su categoría y, dentro, por nombre. */
export function toSeasonSchedules(rows: readonly TeamSchedulesRow[]): TeamSchedules[] {
  return rows
    .map((row) => {
      const category = one(row.categories);
      return {
        team: {
          teamId: row.id,
          teamName: row.name,
          categoryName: category?.name ?? "",
          schedules: toTeamScheduleList(row.team_schedules ?? []),
        },
        sort: category?.sort ?? 0,
      };
    })
    .sort(
      (a, b) =>
        a.sort - b.sort ||
        a.team.categoryName.localeCompare(b.team.categoryName, "es") ||
        a.team.teamName.localeCompare(b.team.teamName, "es") ||
        a.team.teamId.localeCompare(b.team.teamId),
    )
    .map(({ team }) => team);
}
