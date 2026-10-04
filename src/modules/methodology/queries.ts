import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";
import { sectionSubtitle } from "./format";
import {
  PRINCIPLE_COLUMNS,
  SECTION_COLUMNS,
  STANDARD_COLUMNS,
  toClubValue,
  toContentKind,
  toGamePrinciple,
  toStandard,
  toWaySection,
  VALUE_COLUMNS,
} from "./map-rows";
import type {
  ClubValue,
  GamePrinciple,
  Standard,
  WayIndexEntry,
  WaySectionView,
} from "./types";

// Lecturas de la metodología para quien entrena: solo lo publicado.
//
// Todas leen con la sesión de la persona (RLS ya esconde los borradores a quien no
// administra) y aun así filtran por club y por `status = 'published'`: un admin que entrena
// también ve sus borradores con RLS, y no deben salir en The Way. El orden es siempre
// `sort`, `created_at` y, para no depender del azar con filas empatadas, `id`.
//
// Las columnas y el paso de fila a tipo son de `map-rows.ts`, que comparte con
// `admin-queries.ts` para que Gestión y The Way no se desincronicen.

/**
 * El índice de The Way: las secciones publicadas del club en su orden, cada una con la
 * línea que va debajo del título (su resumen, o cuánto hay publicado en su lista).
 *
 * El número de cada fila es el de Gestión: un borrador intermedio deja un hueco, a propósito.
 */
export async function getWayIndex(ctx: ClubContext): Promise<WayIndexEntry[]> {
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const [sections, values, principles, standards] = await Promise.all([
    supabase
      .from("way_sections")
      .select("id, number, slug, title, summary, content_kind")
      .eq("organization_id", orgId)
      .eq("status", "published")
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    // Lo publicado de cada lista, para «3 valores», «4 principios», «5 Standards».
    supabase
      .from("club_values")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "published"),
    supabase
      .from("game_principles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "published"),
    supabase
      .from("standards")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "published"),
  ]);
  if (sections.error) throwReadError("methodology.index", sections.error);
  if (values.error) throwReadError("methodology.index.values", values.error);
  if (principles.error) throwReadError("methodology.index.principles", principles.error);
  if (standards.error) throwReadError("methodology.index.standards", standards.error);

  const counts = {
    values: values.count ?? 0,
    principles: principles.count ?? 0,
    standards: standards.count ?? 0,
  };

  return sections.data.map((row) => ({
    id: row.id,
    number: row.number,
    slug: row.slug,
    title: row.title,
    subtitle: sectionSubtitle(toContentKind(row.content_kind), row.summary, counts),
  }));
}

/**
 * Una sección publicada por su slug, con la lista que le toca según su tipo: valores,
 * principios o Standards; las otras dos van vacías. `null` si no existe o no está
 * publicada, sin distinguir un caso del otro: quien llama responde con el mismo 404.
 */
export async function getWaySection(
  ctx: ClubContext,
  slug: string,
): Promise<WaySectionView | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("way_sections")
    .select(SECTION_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throwReadError("methodology.section", error);
  if (!data) return null;

  const section = toWaySection(data);
  const view: WaySectionView = { section, values: [], principles: [], standards: [] };

  if (section.contentKind === "values") view.values = await getValues(ctx);
  else if (section.contentKind === "principles") view.principles = await getPrinciples(ctx);
  else if (section.contentKind === "standards") view.standards = await getStandards(ctx);

  return view;
}

/** Los Standards publicados del club, en su orden. */
export async function getStandards(ctx: ClubContext): Promise<Standard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("standards")
    .select(STANDARD_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("status", "published")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("methodology.standards", error);

  return data.map(toStandard);
}

/**
 * Los principios de juego publicados del club, cada uno con sus puntos en su orden. Los
 * puntos no tienen estado propio: se ven con su principio, y aquí también se filtran por club.
 */
export async function getPrinciples(ctx: ClubContext): Promise<GamePrinciple[]> {
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const { data, error } = await supabase
    .from("game_principles")
    .select(PRINCIPLE_COLUMNS)
    .eq("organization_id", orgId)
    .eq("status", "published")
    .eq("principle_points.organization_id", orgId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .order("sort", { referencedTable: "principle_points", ascending: true })
    .order("created_at", { referencedTable: "principle_points", ascending: true })
    .order("id", { referencedTable: "principle_points", ascending: true });
  if (error) throwReadError("methodology.principles", error);

  return data.map(toGamePrinciple);
}

/** Los valores publicados del club, en su orden. */
export async function getValues(ctx: ClubContext): Promise<ClubValue[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("club_values")
    .select(VALUE_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("status", "published")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("methodology.values", error);

  return data.map(toClubValue);
}
