import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import { byListName } from "./format";
import {
  ADMIN_TEAM_COLUMNS,
  CATEGORY_COLUMNS,
  PERSON_COLUMNS,
  PERSON_DETAIL_COLUMNS,
  SEASON_COLUMNS,
  SEASON_TEAM_COLUMNS,
  toAdminTeam,
  toCategory,
  toPersonDetail,
  toPersonSummary,
  toSeasonDetail,
  toSeasonSummary,
} from "./map-rows";
import type { AdminTeam, Category, PersonDetail, PersonSummary, SeasonDetail, SeasonSummary } from "./types";

// Lecturas de la estructura del club para Gestión: todo lo del club, de cualquier temporada.
//
// Quien llama ya ha pasado por `requireClub` y `requireAdmin` (`adminPage`). Aquí no se decide
// quién ve qué: lo decide RLS (la dirección ve todos los equipos y todas las personas de su
// club). Sí se filtra siempre por `organization_id`, para no depender de ello ni recorrer filas
// de otros clubes.

/** Las personas que se leen de una vez. Un club con más tendrá que paginar (backlog). */
export const PEOPLE_LIMIT = 1000;

/** Las temporadas del club, de la más reciente a la más antigua. */
export async function listSeasons(ctx: ClubContext): Promise<SeasonSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("seasons")
    .select(SEASON_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("starts_on", { ascending: false })
    .order("id", { ascending: true });
  if (error) throwReadError("structure.seasons", error);

  return data.map(toSeasonSummary);
}

/**
 * La temporada que toca enseñar cuando la URL no dice cuál: la actual y, si el club no tiene
 * ninguna actual, la más reciente. `null` si no hay ninguna.
 */
export function defaultSeason(seasons: readonly SeasonSummary[]): SeasonSummary | null {
  return seasons.find((season) => season.isCurrent) ?? seasons[0] ?? null;
}

/**
 * Una temporada del club con sus equipos. `null` si no existe en este club o si `id` no tiene
 * forma de uuid (llega de la URL: ni se consulta).
 */
export async function getSeason(ctx: ClubContext, id: string): Promise<SeasonDetail | null> {
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();

  const [season, teams] = await Promise.all([
    supabase
      .from("seasons")
      .select(SEASON_COLUMNS)
      .eq("organization_id", ctx.org.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("teams")
      .select(SEASON_TEAM_COLUMNS)
      .eq("organization_id", ctx.org.id)
      .eq("season_id", id),
  ]);
  if (season.error) throwReadError("structure.season", season.error);
  if (teams.error) throwReadError("structure.season-teams", teams.error);

  return season.data ? toSeasonDetail(season.data, teams.data) : null;
}

/** Las categorías del club, en su orden, con si algún equipo las lleva. */
export async function listCategories(ctx: ClubContext): Promise<Category[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("structure.categories", error);

  return data.map(toCategory);
}

/**
 * Un equipo del club, de la temporada que sea, con su cuerpo técnico y su plantilla. `null` si
 * no existe en este club o si `id` no tiene forma de uuid.
 */
export async function getAdminTeam(ctx: ClubContext, id: string): Promise<AdminTeam | null> {
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select(ADMIN_TEAM_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throwReadError("structure.team", error);

  return data ? toAdminTeam(data) : null;
}

/**
 * Las personas del club, archivadas incluidas, por apellidos, cada una con sus equipos de la
 * temporada actual. Hasta `PEOPLE_LIMIT`.
 */
export async function listPeople(ctx: ClubContext): Promise<PersonSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("people")
    .select(PERSON_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(PEOPLE_LIMIT);
  if (error) throwReadError("structure.people", error);

  // La base ordena por bytes; la lista, como se lee en español (la «Á» junto a la «A»).
  return data.map(toPersonSummary).sort(byListName);
}

/**
 * Una persona del club con sus equipos de cualquier temporada y su acceso. `null` si no existe
 * en este club o si `id` no tiene forma de uuid.
 */
export async function getPerson(ctx: ClubContext, id: string): Promise<PersonDetail | null> {
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("people")
    .select(PERSON_DETAIL_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throwReadError("structure.person", error);

  return data ? toPersonDetail(data) : null;
}
