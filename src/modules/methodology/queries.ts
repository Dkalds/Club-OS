import type { Database } from "@/lib/database.types";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";
import { sectionSubtitle } from "./format";
import {
  CONTENT_KIND_LABELS,
  type ClubValue,
  type ContentKind,
  type GamePrinciple,
  type Standard,
  type WayIndexEntry,
  type WaySection,
  type WaySectionView,
} from "./types";

// Lecturas de la metodología para quien entrena: solo lo publicado.
//
// Todas leen con la sesión de la persona (RLS ya esconde los borradores a quien no
// administra) y aun así filtran por club y por `status = 'published'`: un admin que entrena
// también ve sus borradores con RLS, y no deben salir en The Way. El orden es siempre
// `sort`, `created_at` y, para no depender del azar con filas empatadas, `id`.
//
// Lo que va marcado como compartido lo reutiliza `admin-queries.ts`: las mismas columnas y
// el mismo paso de fila a tipo, para que Gestión y The Way no se desincronicen.

type Tables = Database["public"]["Tables"];

/** Compartido con `admin-queries.ts`. */
export type SectionRow = Pick<
  Tables["way_sections"]["Row"],
  | "id"
  | "number"
  | "slug"
  | "title"
  | "summary"
  | "body_md"
  | "content_kind"
  | "status"
  | "updated_at"
>;
/** Compartido con `admin-queries.ts`. */
export type ValueRow = Pick<
  Tables["club_values"]["Row"],
  "id" | "code" | "title" | "description" | "status"
>;
/** Compartido con `admin-queries.ts`. */
export type PrincipleRow = Pick<
  Tables["game_principles"]["Row"],
  "id" | "slug" | "title" | "summary" | "status"
> & { principle_points: Array<Pick<Tables["principle_points"]["Row"], "id" | "text">> | null };
/** Compartido con `admin-queries.ts`. */
export type StandardRow = Pick<
  Tables["standards"]["Row"],
  "id" | "number" | "title" | "description" | "status"
>;

/** Compartido con `admin-queries.ts`. */
export const SECTION_COLUMNS =
  "id, number, slug, title, summary, body_md, content_kind, status, updated_at";
/** Compartido con `admin-queries.ts`. */
export const VALUE_COLUMNS = "id, code, title, description, status";
/**
 * Compartido con `admin-queries.ts`. Los puntos van embebidos; quien lee tiene que filtrarlos
 * por club y ordenarlos (`principle_points.organization_id`, `sort`, `created_at`, `id`).
 */
export const PRINCIPLE_COLUMNS =
  "id, slug, title, summary, status, principle_points(id, text)";
/** Compartido con `admin-queries.ts`. */
export const STANDARD_COLUMNS = "id, number, title, description, status";

/**
 * Un error de Supabase no se traga ni se convierte en datos vacíos: se registra (sin datos
 * personales, ver `logError`) y se lanza para que lo recoja el error de la página. No se
 * adjunta como `cause`: su mensaje puede llevar el contenido de una fila.
 *
 * Compartido con `admin-queries.ts`.
 */
export function fail(tag: string, error: unknown): never {
  logError(tag, error);
  throw new Error(`${tag}: no se pudo leer de la base de datos`);
}

/** La columna es un texto libre con un CHECK; lo que no se reconozca se pinta como texto. */
function toContentKind(value: string): ContentKind {
  const kinds = Object.keys(CONTENT_KIND_LABELS) as ContentKind[];
  return kinds.find((kind) => kind === value) ?? "text";
}

/** Compartido con `admin-queries.ts`. `updatedAt` queda tal cual lo da PostgREST. */
export function toWaySection(row: SectionRow): WaySection {
  return {
    id: row.id,
    number: row.number,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    bodyMd: row.body_md,
    contentKind: toContentKind(row.content_kind),
    status: row.status,
    updatedAt: row.updated_at,
  };
}

/** Compartido con `admin-queries.ts`. */
export function toClubValue(row: ValueRow): ClubValue {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
  };
}

/** Compartido con `admin-queries.ts`. Los puntos ya vienen ordenados de la consulta. */
export function toGamePrinciple(row: PrincipleRow): GamePrinciple {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    status: row.status,
    points: (row.principle_points ?? []).map((point) => ({ id: point.id, text: point.text })),
  };
}

/** Compartido con `admin-queries.ts`. */
export function toStandard(row: StandardRow): Standard {
  return { id: row.id, number: row.number, title: row.title, description: row.description };
}

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
  if (sections.error) fail("methodology.index", sections.error);
  if (values.error) fail("methodology.index.values", values.error);
  if (principles.error) fail("methodology.index.principles", principles.error);
  if (standards.error) fail("methodology.index.standards", standards.error);

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
  if (error) fail("methodology.section", error);
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
  if (error) fail("methodology.standards", error);

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
  if (error) fail("methodology.principles", error);

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
  if (error) fail("methodology.values", error);

  return data.map(toClubValue);
}
