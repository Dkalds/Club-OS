import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  PRINCIPLE_COLUMNS,
  SECTION_COLUMNS,
  STANDARD_COLUMNS,
  toClubValue,
  toGamePrinciple,
  toStandard,
  toWaySection,
  VALUE_COLUMNS,
} from "./map-rows";
import type { AdminStandard, ClubValue, GamePrinciple, WaySection } from "./types";

// Lecturas de la metodología para Gestión: todo lo del club, borradores incluidos.
//
// Quien llama ya ha pasado por `requireClub` y `requireAdmin`. Aquí no se decide quién ve
// borradores: lo decide RLS (solo el admin del club los lee). Sí se filtra siempre por
// `organization_id`, para no depender de ello ni recorrer filas de otros clubes. Mismo orden
// que en The Way: `sort`, `created_at` e `id`.

/** Todas las secciones del club, publicadas o no, en su orden de Gestión. */
export async function listSectionsForAdmin(ctx: ClubContext): Promise<WaySection[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("way_sections")
    .select(SECTION_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("methodology.admin.sections", error);

  return data.map(toWaySection);
}

/**
 * Una sección del club por su id, sea cual sea su estado. `null` si no existe en este club
 * o si `id` no tiene forma de uuid (llega de la URL: ni se consulta).
 */
export async function getSectionForAdmin(ctx: ClubContext, id: string): Promise<WaySection | null> {
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("way_sections")
    .select(SECTION_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throwReadError("methodology.admin.section", error);

  return data ? toWaySection(data) : null;
}

/** Todos los valores del club, publicados o no. */
export async function listValuesForAdmin(ctx: ClubContext): Promise<ClubValue[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("club_values")
    .select(VALUE_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("methodology.admin.values", error);

  return data.map(toClubValue);
}

/** Todos los principios del club, publicados o no, con sus puntos en su orden. */
export async function listPrinciplesForAdmin(ctx: ClubContext): Promise<GamePrinciple[]> {
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const { data, error } = await supabase
    .from("game_principles")
    .select(PRINCIPLE_COLUMNS)
    .eq("organization_id", orgId)
    .eq("principle_points.organization_id", orgId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .order("sort", { referencedTable: "principle_points", ascending: true })
    .order("created_at", { referencedTable: "principle_points", ascending: true })
    .order("id", { referencedTable: "principle_points", ascending: true });
  if (error) throwReadError("methodology.admin.principles", error);

  return data.map(toGamePrinciple);
}

/** Todos los Standards del club, publicados o no. */
export async function listStandardsForAdmin(ctx: ClubContext): Promise<AdminStandard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("standards")
    .select(STANDARD_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("methodology.admin.standards", error);

  return data.map((row) => ({ ...toStandard(row), status: row.status }));
}
