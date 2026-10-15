import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import { DETAIL_COLUMNS, toGameDetail } from "./map-rows";
import type { GameDetail } from "./types";

// Lectura de un partido. Lee con la sesión de la persona (RLS: dirección y el cuerpo técnico del
// equipo) y filtra siempre por club. Un error de lectura se registra y lanza (`throwReadError`).
// La lista de partidos es la de la Agenda (`@/modules/schedule`).

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
