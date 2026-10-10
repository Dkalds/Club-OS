import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { ProposalDrill, ProposalFocus, ProposalInput } from "./proposal";

// Lo que lee la propuesta de entrenamiento (`buildProposal`): la sesión, lo que se sabe de su
// equipo, los ejercicios publicados de la biblioteca y lo usado hace poco.
//
// Todo con la sesión de la persona (pasa por RLS) y acotado al club. Un error de lectura se
// registra y lanza (`throwReadError`): la acción que lo llama lo convierte en su resultado.

/** Los ejercicios que como mucho se miran para proponer, por título. */
export const PROPOSAL_SCAN_LIMIT = 500;

/** Las sesiones anteriores del equipo cuyos ejercicios se prefieren no repetir. */
export const RECENT_SESSIONS = 3;

const DRILL_COLUMNS = `id, title, min_age, max_age, min_players, max_players, min_minutes, max_minutes,
  drill_focus_areas(focus_areas(slug, name, sort)),
  drill_coaching_points(is_key),
  drill_variants(id)`;

/** PostgREST devuelve una relación anidada como objeto o como lista de un elemento. */
function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** La edad de una categoría: «U12» es 12. `null` si no tiene esa forma. */
export function ageOfBand(band: string | null | undefined): number | null {
  const match = /^U(\d{1,2})$/.exec(band ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Lo que `buildProposal` necesita para la sesión del entreno `eventId`. `null` si el id no es un
 * uuid, o si el entreno no llega (no existe, es de otro club o RLS no lo deja ver) o no tiene
 * plan: quien llama responde con el mismo `NOT_FOUND`.
 *
 * Solo entran ejercicios publicados: un borrador no lo ve el resto del cuerpo técnico, y la
 * sesión la ve todo el equipo (como en `findDrills`). «Hace poco» son las tres últimas sesiones
 * del equipo anteriores a esta que no se cancelaron.
 */
export async function getProposalInput(ctx: ClubContext, eventId: string): Promise<ProposalInput | null> {
  if (!UUID_RE.test(eventId)) return null;

  const supabase = await createClient();
  const orgId = ctx.org.id;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, team_id, starts_at, ends_at, practice_plans(primary_focus_id, secondary_focus_id)")
    .eq("organization_id", orgId)
    .eq("id", eventId)
    .eq("kind", "practice")
    .maybeSingle();
  if (eventError) throwReadError("practice.proposal-event", eventError);

  const plan = first(event?.practice_plans);
  if (!event || !plan) return null;

  const focusIds = [plan.primary_focus_id, plan.secondary_focus_id].filter((id): id is string => id !== null);

  const [team, roster, focusAreas, drills, recent] = await Promise.all([
    supabase
      .from("teams")
      .select("id, categories(age_band)")
      .eq("organization_id", orgId)
      .eq("id", event.team_id)
      .maybeSingle(),
    supabase
      .from("team_players")
      .select("person_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("team_id", event.team_id),
    focusIds.length > 0
      ? supabase.from("focus_areas").select("id, slug, name").eq("organization_id", orgId).in("id", focusIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("drills")
      .select(DRILL_COLUMNS)
      .eq("organization_id", orgId)
      .eq("status", "published")
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .limit(PROPOSAL_SCAN_LIMIT),
    supabase
      .from("events")
      .select("id, practice_plans(practice_items(drill_id))")
      .eq("organization_id", orgId)
      .eq("team_id", event.team_id)
      .eq("kind", "practice")
      .neq("status", "cancelled")
      .lt("starts_at", event.starts_at)
      .order("starts_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(RECENT_SESSIONS),
  ]);
  if (team.error) throwReadError("practice.proposal-team", team.error);
  if (roster.error) throwReadError("practice.proposal-roster", roster.error);
  if (focusAreas.error) throwReadError("practice.proposal-focus", focusAreas.error);
  if (drills.error) throwReadError("practice.proposal-drills", drills.error);
  if (recent.error) throwReadError("practice.proposal-recent", recent.error);

  const focusById = new Map<string, ProposalFocus>(
    focusAreas.data.map((focus) => [focus.id, { slug: focus.slug, name: focus.name }]),
  );
  const focusOf = (id: string | null) => (id === null ? null : (focusById.get(id) ?? null));

  const recentDrillIds = new Set<string>();
  for (const session of recent.data) {
    for (const item of first(session.practice_plans)?.practice_items ?? []) {
      if (item.drill_id !== null) recentDrillIds.add(item.drill_id);
    }
  }

  const players = roster.count ?? 0;

  return {
    minutes: Math.max(0, Math.round((Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000)),
    age: ageOfBand(first(team.data?.categories)?.age_band),
    // Un equipo sin jugadores dados de alta no dice cuántos entrenan: no se filtra por ello.
    players: players > 0 ? players : null,
    primaryFocus: focusOf(plan.primary_focus_id),
    secondaryFocus: focusOf(plan.secondary_focus_id),
    drills: drills.data.map(
      (row): ProposalDrill => ({
        id: row.id,
        title: row.title,
        minAge: row.min_age,
        maxAge: row.max_age,
        minPlayers: row.min_players,
        maxPlayers: row.max_players,
        minMinutes: row.min_minutes,
        maxMinutes: row.max_minutes,
        focus: row.drill_focus_areas
          .flatMap((link) => (link.focus_areas ? [link.focus_areas] : []))
          .sort((a, b) => a.sort - b.sort || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
          .map(({ slug, name }) => ({ slug, name })),
        keyPoints: row.drill_coaching_points.filter((point) => point.is_key).length,
        variants: row.drill_variants.length,
      }),
    ),
    recentDrillIds: [...recentDrillIds],
  };
}
