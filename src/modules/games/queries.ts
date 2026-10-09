import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import { listMyTeams } from "@/modules/team/queries";
import type { ClubContext } from "@/modules/tenancy/queries";
import { LIST_LIMIT } from "./limits";
import { DETAIL_COLUMNS, LIST_COLUMNS, toGameDetail, toGameListItems } from "./map-rows";
import type { GameDetail, GameListItem, GameScope } from "./types";

// Lecturas de partidos. Leen con la sesión de la persona (RLS: dirección y el cuerpo técnico del
// equipo) y filtran siempre por club y por «mis equipos» de esta temporada. Un error de lectura
// se registra y lanza (`throwReadError`).

export type GameList = {
  games: GameListItem[];
  /** Hay más de los que se enseñan: la lista lo dice en vez de cortar en silencio. */
  truncated: boolean;
  teamCount: number;
};

/**
 * Los partidos de «mis equipos». `upcoming`: programados que aún no han terminado, del más
 * cercano al más lejano. `played`: todo lo demás (jugados, cancelados y programados que ya
 * terminaron sin resultado), del más reciente al más antiguo.
 */
export async function listGames(ctx: ClubContext, scope: GameScope, nowIso: string): Promise<GameList> {
  const teams = await listMyTeams(ctx);
  if (teams.length === 0) return { games: [], truncated: false, teamCount: 0 };

  const supabase = await createClient();
  const events = supabase
    .from("events")
    .select(LIST_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("kind", "game")
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
  if (error) throwReadError("games.list", error);

  return {
    games: toGameListItems(data.slice(0, LIST_LIMIT), teams, ctx.org.timezone, nowIso),
    truncated: data.length > LIST_LIMIT,
    teamCount: teams.length,
  };
}

/**
 * Un partido de este club y de esta temporada. `null` si el id no es válido, no es un partido,
 * es de otro club o de otra temporada, o RLS no lo deja ver: la página responde con un 404 que
 * no distingue entre esos casos.
 */
export async function getGame(ctx: ClubContext, eventId: string, nowIso: string): Promise<GameDetail | null> {
  if (!UUID_RE.test(eventId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", eventId)
    .eq("kind", "game")
    .eq("teams.seasons.is_current", true)
    .maybeSingle();
  if (error) throwReadError("games.detail", error);

  return data ? toGameDetail(data, ctx.org.timezone, nowIso) : null;
}
