import type { HomeEvent, HomeInput } from "./types";

// De las filas que devuelve PostgREST a la entrada de `buildHome`. Es una función pura
// aparte para poder probarla sin base de datos.
//
// Una relación embebida llega como objeto si PostgREST la reconoce «a uno» y como lista si
// no. Las claves foráneas de estas tablas son compuestas (`organization_id`, x_id) y las
// de `practice_plans` y `games` hacia `events` no cubren una columna única por sí solas, así
// que lo normal es una lista de un elemento. Aquí se lee igual en los dos casos.
type Embedded<T> = T | T[] | null;

/** Una fila de `team_staff` con su equipo y la temporada de ese equipo. */
export type StaffTeamRow = {
  teams: Embedded<{ id: string; name: string; seasons: Embedded<{ name: string }> }>;
};

/** Una fila de `events` con su plan (y los focos e ítems de ese plan) y los datos del partido. */
export type EventRow = {
  id: string;
  team_id: string;
  kind: HomeEvent["kind"];
  status: HomeEvent["status"];
  starts_at: string;
  ends_at: string;
  location: string | null;
  practice_plans: Embedded<{
    title: string;
    primary_focus: Embedded<{ name: string }>;
    secondary_focus: Embedded<{ name: string }>;
    practice_items: Array<{ sort: number; minutes: number }> | null;
  }>;
  games: Embedded<{
    opponent_name: string;
    competition_name: string | null;
    home_away: string | null;
  }>;
};

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Los equipos de la persona, en un orden fijo (por nombre y, a igual nombre, por id): el
 * primero pone la temporada del encabezado de Inicio. Una fila sin equipo no se cuenta.
 */
export function toTeams(rows: StaffTeamRow[]): HomeInput["teams"] {
  const teams: HomeInput["teams"] = [];

  for (const row of rows) {
    const team = one(row.teams);
    if (!team) continue;
    teams.push({ id: team.id, name: team.name, seasonName: one(team.seasons)?.name ?? "" });
  }

  return teams.sort(
    (a, b) => a.name.localeCompare(b.name, "es") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function homeAway(value: string | null): "home" | "away" | null {
  return value === "home" || value === "away" ? value : null;
}

/**
 * Los eventos con su plan y su partido. En el plan, los focos van primero el principal y
 * luego el secundario (una sola vez si fueran el mismo) y los minutos de los ítems, por
 * orden de `sort`.
 */
export function toHomeEvents(rows: EventRow[]): HomeEvent[] {
  return rows.map((row) => {
    const plan = one(row.practice_plans);
    const game = one(row.games);

    const focus: string[] = [];
    for (const area of [one(plan?.primary_focus), one(plan?.secondary_focus)]) {
      if (area && !focus.includes(area.name)) focus.push(area.name);
    }

    return {
      id: row.id,
      teamId: row.team_id,
      kind: row.kind,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location,
      plan: plan
        ? {
            title: plan.title,
            focus,
            itemMinutes: [...(plan.practice_items ?? [])]
              .sort((a, b) => a.sort - b.sort)
              .map((item) => item.minutes),
          }
        : null,
      game: game
        ? {
            opponent: game.opponent_name,
            competition: game.competition_name,
            homeAway: homeAway(game.home_away),
          }
        : null,
    };
  });
}
