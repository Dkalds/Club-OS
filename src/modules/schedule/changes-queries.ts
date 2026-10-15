import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import { getTeamScope } from "@/modules/team/scope";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  buildRecentChanges,
  type ChangeWhat,
  type EventChange,
  type EventKind,
  type RecentChange,
  type RecentEvent,
} from "./changes";

// Lecturas del registro de cambios. Leen con la sesión de la persona: RLS deja ver los cambios
// de un evento a quien ve el evento (la dirección y el cuerpo técnico de su equipo). Se filtra
// siempre por club.

/** Cuántos días atrás cuenta un cambio como reciente. */
export const RECENT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Todos los cambios de un evento del club, del más reciente al más antiguo. Vacío si el id no
 * tiene forma de uuid (llega de la URL: ni se consulta), si el evento no es de este club o si
 * quien mira no lo ve.
 */
export async function listEventChanges(ctx: ClubContext, eventId: string): Promise<EventChange[]> {
  if (!UUID_RE.test(eventId)) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("event_changes")
    .select("id, what, old_starts_at, old_ends_at, old_location, changed_at")
    .eq("organization_id", ctx.org.id)
    .eq("event_id", eventId)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throwReadError("schedule.event-changes", error);

  return data.map((row) => ({
    id: row.id,
    what: row.what as ChangeWhat,
    oldStartsAt: row.old_starts_at,
    oldEndsAt: row.old_ends_at,
    oldLocation: row.old_location,
    changedAt: row.changed_at,
  }));
}

/**
 * Los eventos del equipo activo (el elegido o, sin elegir, todos «mis equipos») que han cambiado
 * en los últimos `RECENT_DAYS` días y aún no han pasado: lo que su equipo tiene que saber. Uno
 * por evento, del que antes se juega al que más tarde, como mucho `limit`; `more` es cuántos
 * quedan fuera.
 *
 * Se lee desde los eventos y no desde los cambios: así el tope es por evento y por cercanía. Un
 * horario que cambia deja decenas de cambios de golpe, y cortando por ellos se quedaría fuera
 * justo lo de mañana.
 *
 * `nowIso` es el instante actual del servidor en ISO: nunca llega de la petición, porque va
 * dentro del filtro. Las horas salen en la zona del club.
 */
export async function listRecentChanges(
  ctx: ClubContext,
  nowIso: string,
  limit: number,
): Promise<{ items: RecentChange[]; more: number }> {
  const { scoped } = await getTeamScope(ctx);
  if (scoped.length === 0) return { items: [], more: 0 };

  const supabase = await createClient();
  const since = new Date(new Date(nowIso).getTime() - RECENT_DAYS * DAY_MS).toISOString();

  const { data, error, count } = await supabase
    .from("events")
    .select(
      `id, kind, starts_at, ends_at, teams(name), practice_plans(title), games(opponent_name),
       event_changes!inner(what, changed_at)`,
      { count: "exact" },
    )
    .eq("organization_id", ctx.org.id)
    .in(
      "team_id",
      scoped.map((team) => team.id),
    )
    .gt("ends_at", nowIso)
    .gte("event_changes.changed_at", since)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throwReadError("schedule.recent-changes", error);

  const events: RecentEvent[] = [];
  for (const row of data) {
    const kind = row.kind as EventKind;
    const name = kind === "game" ? one(row.games)?.opponent_name : one(row.practice_plans)?.title;
    // Un entrenamiento sin plan o un partido sin sus datos no se enseña en ningún otro sitio.
    if (!name) continue;

    events.push({
      id: row.id,
      kind,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      teamName: one(row.teams)?.name ?? "",
      name,
      whats: row.event_changes.map((change) => change.what as ChangeWhat),
    });
  }

  return buildRecentChanges(events, {
    clubSlug: ctx.org.slug,
    tz: ctx.org.timezone,
    // Las filas que se saltan tampoco cuentan entre las que quedan por ver.
    total: (count ?? data.length) - (data.length - events.length),
    showTeam: scoped.length > 1,
  });
}
