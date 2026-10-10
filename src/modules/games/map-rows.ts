import { dayChip, formatGameSlot, isoToLocalInputs, localTime, monthChip } from "@/lib/time";
import type { GameDetail, GameListItem, GameStatus, HomeAway } from "./types";

// De la fila de PostgREST al partido de su ficha. La lista de partidos es la de la Agenda
// (`@/modules/schedule`). Funciones puras, aparte para probarlas
// sin base de datos. Las horas salen en la zona del club (regla 7).
//
// `games` cuelga de `events` por una clave compuesta: llega como objeto o como lista de un
// elemento. Aquí se lee igual en los dos casos.
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ── Columnas ─────────────────────────────────────────────────────────────────────────

/**
 * El detalle, con su equipo. El `!inner` con el filtro sobre `teams.seasons.is_current` deja
 * fuera un partido de otra temporada ([D7]).
 */
export const DETAIL_COLUMNS = `id, team_id, status, starts_at, ends_at, location,
  teams!inner(name, seasons!inner(is_current)),
  games(opponent_name, competition_name, home_away, score_for, score_against, opponent_notes)`;

// ── Filas ────────────────────────────────────────────────────────────────────────────

type GameRow = {
  opponent_name: string;
  competition_name: string | null;
  home_away: string | null;
  score_for: number | null;
  score_against: number | null;
};

export type GameEventRow = {
  id: string;
  team_id: string;
  status: GameStatus;
  starts_at: string;
  ends_at: string;
  location: string | null;
  games: Embedded<GameRow>;
};

export type GameDetailRow = Omit<GameEventRow, "games"> & {
  teams: Embedded<{ name: string }>;
  games: Embedded<GameRow & { opponent_notes: string | null }>;
};

function toHomeAway(value: string | null): HomeAway | null {
  return value === "home" || value === "away" ? value : null;
}

function toItem(row: GameEventRow, teamName: string, game: GameRow, timezone: string, nowIso: string): GameListItem {
  const homeAway = toHomeAway(game.home_away);
  return {
    eventId: row.id,
    teamId: row.team_id,
    teamName,
    opponent: game.opponent_name,
    competition: game.competition_name,
    homeAway,
    status: row.status,
    started: Date.parse(row.starts_at) <= Date.parse(nowIso),
    slotLabel: formatGameSlot(row.starts_at, timezone, homeAway),
    dateChip: dayChip(row.starts_at, timezone),
    monthChip: monthChip(row.starts_at, timezone),
    time: localTime(row.starts_at, timezone),
    location: row.location,
    score:
      game.score_for !== null && game.score_against !== null
        ? { for: game.score_for, against: game.score_against }
        : null,
  };
}

/** El detalle, o `null` si no llega su partido o su equipo. */
export function toGameDetail(row: GameDetailRow, timezone: string, nowIso: string): GameDetail | null {
  const game = one(row.games);
  const team = one(row.teams);
  if (!game || !team) return null;

  const { date, time } = isoToLocalInputs(row.starts_at, timezone);
  return {
    ...toItem(row, team.name, game, timezone, nowIso),
    opponentNotes: game.opponent_notes,
    form: {
      date,
      time,
      durationMinutes: Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000),
    },
  };
}
