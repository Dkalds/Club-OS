import type { AgendaEvent } from "./types";

// De las filas que devuelve PostgREST a la entrada de `buildAgenda`. Pura, para probarla sin
// base de datos.
//
// `practice_plans` y `games` cuelgan de `events` por claves compuestas: llegan como objeto o
// como lista de un elemento. Aquí se lee igual en los dos casos. Una fila anidada que RLS no
// deja ver llega como `null` o como lista vacía.
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** El evento con lo justo de su plan (título y minutos de sus ítems) y de su partido. */
export const AGENDA_COLUMNS = `id, team_id, kind, status, starts_at, ends_at, location,
  practice_plans(title, practice_items(sort, minutes)),
  games(opponent_name, competition_name, home_away, score_for, score_against)`;

export type AgendaRow = {
  id: string;
  team_id: string;
  kind: AgendaEvent["kind"];
  status: AgendaEvent["status"];
  starts_at: string;
  ends_at: string;
  location: string | null;
  practice_plans: Embedded<{
    title: string;
    practice_items: Array<{ sort: number; minutes: number }> | null;
  }>;
  games: Embedded<{
    opponent_name: string;
    competition_name: string | null;
    home_away: string | null;
    score_for: number | null;
    score_against: number | null;
  }>;
};

function homeAway(value: string | null): "home" | "away" | null {
  return value === "home" || value === "away" ? value : null;
}

/** Los eventos con su plan y su partido. Los minutos de los ítems, por orden de `sort`. */
export function toAgendaEvents(rows: readonly AgendaRow[]): AgendaEvent[] {
  return rows.map((row) => {
    const plan = one(row.practice_plans);
    const game = one(row.games);

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
            itemMinutes: [...(plan.practice_items ?? [])].sort((a, b) => a.sort - b.sort).map((item) => item.minutes),
          }
        : null,
      game: game
        ? {
            opponent: game.opponent_name,
            competition: game.competition_name,
            homeAway: homeAway(game.home_away),
            score:
              game.score_for !== null && game.score_against !== null
                ? { for: game.score_for, against: game.score_against }
                : null,
          }
        : null,
    };
  });
}
