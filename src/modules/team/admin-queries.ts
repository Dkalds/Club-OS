import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";

// Lecturas de temporadas, categorías y equipos para Gestión (`/admin/teams`, Fase 7 Task 10):
// todas las del club, no solo las de la temporada actual. Quien llama ya ha pasado por
// `requireClub` y `requireAdmin`; aquí se filtra siempre por `organization_id`.

export type AdminSeason = { id: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean };
export type AdminCategory = { id: string; name: string; ageBand: string; sort: number };
export type AdminTeam = {
  id: string;
  name: string;
  seasonId: string;
  seasonName: string;
  categoryId: string;
  categoryName: string;
};

/** Todas las temporadas del club, de la más reciente a la más antigua. */
export async function listSeasonsForAdmin(ctx: ClubContext): Promise<AdminSeason[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("organization_id", ctx.org.id)
    .order("starts_on", { ascending: false });
  if (error) throwReadError("team.admin.seasons", error);

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isCurrent: row.is_current,
  }));
}

/** Todas las categorías del club, en su orden. */
export async function listCategoriesForAdmin(ctx: ClubContext): Promise<AdminCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, age_band, sort")
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throwReadError("team.admin.categories", error);

  return data.map((row) => ({ id: row.id, name: row.name, ageBand: row.age_band, sort: row.sort }));
}

/** Todos los equipos del club, de cualquier temporada, con el nombre de su temporada y categoría. */
export async function listTeamsForAdminDetailed(ctx: ClubContext): Promise<AdminTeam[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .select("id, name, season_id, category_id, seasons ( name ), categories ( name )")
    .eq("organization_id", ctx.org.id)
    .order("name", { ascending: true });
  if (error) throwReadError("team.admin.teams", error);

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    seasonId: row.season_id,
    seasonName: row.seasons?.name ?? "",
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? "",
  }));
}
