import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  GOAL_COLUMNS,
  NOTE_COLUMNS,
  PLAYER_COLUMNS,
  toGoalFormOptions,
  toPlayerProfile,
} from "./map-rows";
import type { GoalFormOptions, PlayerProfile } from "./types";

// Lecturas de la ficha del jugador. Leen con la sesión de la persona (RLS decide qué objetivos
// y qué notas llegan: una nota privada ajena no llega nunca) y filtran siempre por club,
// equipo y jugador. Un error de lectura se registra y lanza (`throwReadError`); nunca el
// contenido de una nota o un objetivo.

/**
 * La ficha de `personId` en `teamId`: el jugador, sus objetivos en ese equipo y las notas que
 * quien la pide puede leer. `null` si los ids no son válidos, el jugador no está en la
 * plantilla de ese equipo de esta temporada, o RLS no deja verlo: la página responde con un 404
 * que no distingue entre esos casos.
 */
export async function getPlayerProfile(
  ctx: ClubContext,
  teamId: string,
  personId: string,
): Promise<PlayerProfile | null> {
  if (!UUID_RE.test(teamId) || !UUID_RE.test(personId)) return null;

  const supabase = await createClient();
  const orgId = ctx.org.id;

  const player = await supabase
    .from("team_players")
    .select(PLAYER_COLUMNS)
    .eq("organization_id", orgId)
    .eq("team_id", teamId)
    .eq("person_id", personId)
    .eq("teams.seasons.is_current", true)
    .maybeSingle();
  if (player.error) throwReadError("development.player", player.error);
  if (!player.data) return null;

  const [goals, notes, auth] = await Promise.all([
    supabase
      .from("player_goals")
      .select(GOAL_COLUMNS)
      .eq("organization_id", orgId)
      .eq("team_id", teamId)
      .eq("person_id", personId),
    supabase
      .from("coach_notes")
      .select(NOTE_COLUMNS)
      .eq("organization_id", orgId)
      .eq("team_id", teamId)
      .eq("person_id", personId),
    supabase.auth.getClaims(),
  ]);
  if (goals.error) throwReadError("development.goals", goals.error);
  if (notes.error) throwReadError("development.notes", notes.error);
  if (auth.error) throwReadError("development.user", auth.error);

  return toPlayerProfile({
    player: player.data,
    goals: goals.data,
    notes: notes.data,
    userId: auth.data?.claims.sub ?? "",
    timezone: ctx.org.timezone,
  });
}

/** Los focos del club en su orden y sus Standards publicados: lo que se liga a un objetivo. */
export async function getGoalFormOptions(ctx: ClubContext): Promise<GoalFormOptions> {
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const [focusAreas, standards] = await Promise.all([
    supabase
      .from("focus_areas")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("sort", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("standards")
      .select("id, number, title")
      .eq("organization_id", orgId)
      .eq("status", "published"),
  ]);
  if (focusAreas.error) throwReadError("development.focus-areas", focusAreas.error);
  if (standards.error) throwReadError("development.standards", standards.error);

  return toGoalFormOptions(focusAreas.data, standards.data);
}
