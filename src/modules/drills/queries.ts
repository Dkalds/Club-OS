import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { signedUrl } from "@/modules/media/storage";
import { throwReadError } from "@/modules/methodology/map-rows";
import { getPrinciples, getStandards } from "@/modules/methodology/queries";
import type { GamePrinciple, Standard } from "@/modules/methodology/types";
import type { ClubContext } from "@/modules/tenancy/queries";
import {
  DETAIL_COLUMNS,
  SEARCH_LIMIT,
  SUMMARY_COLUMNS,
  toDrillDetail,
  toDrillSummary,
} from "./map-rows";
import type { DrillDetail, DrillFilters, DrillSummary, FocusArea } from "./types";

// Lecturas de la biblioteca de ejercicios para quien entrena.
//
// Todas leen con la sesión de la persona: RLS ya decide qué ejercicios existen para ella (un
// borrador solo lo ven su autor y la dirección; un jugador o una familia no ven ninguno). Aun
// así filtran por club, porque quien es de dos clubes ve los dos. Un error de lectura no se
// traga ni se convierte en «no existe»: se registra y lanza (`throwReadError`), y lo recoge el
// error de la página.
//
// Las columnas, el paso de fila a tipo y el orden de lo anidado son de `map-rows.ts`.

type Db = SupabaseClient<Database>;
type SearchArgs = Database["public"]["Functions"]["search_drills"]["Args"];

/** Un uuid escrito con guiones, sin mirar versión ni variante. Lo demás no puede ser un id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un texto de filtro, o `undefined` si está vacío o en blanco. Para `search_drills` un texto
 * vacío NO es «ausente»: `p_focus => ''` filtra por el objetivo `''` y no devuelve nada.
 */
function present(text: string | undefined): string | undefined {
  return text !== undefined && text.trim() !== "" ? text : undefined;
}

/**
 * Los argumentos de `search_drills`: el club y solo los filtros que hay. Una clave ausente es
 * lo mismo que `null` para PostgREST, y los tipos generados no admiten `null`.
 */
function searchArgs(orgId: string, filters: DrillFilters): SearchArgs {
  const args: SearchArgs = { p_org: orgId };

  const q = present(filters.q);
  if (q !== undefined) args.p_q = q;
  const focus = present(filters.focus);
  if (focus !== undefined) args.p_focus = focus;
  const principle = present(filters.principle);
  if (principle !== undefined) args.p_principle = principle;
  if (filters.age !== undefined) args.p_age = filters.age;
  if (filters.players !== undefined) args.p_players = filters.players;
  if (filters.minutes !== undefined) args.p_minutes = filters.minutes;

  return args;
}

/**
 * Los ejercicios del club que no están archivados y cumplen los filtros, por título y como
 * mucho 100. La búsqueda de texto y los filtros los resuelve la función `search_drills`
 * (sin tildes, con RLS de quien llama); la función no ordena, así que se ordena aquí.
 */
export async function searchDrills(ctx: ClubContext, filters: DrillFilters): Promise<DrillSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("search_drills", searchArgs(ctx.org.id, filters))
    .select(SUMMARY_COLUMNS)
    .order("title", { ascending: true })
    .limit(SEARCH_LIMIT);
  if (error) throwReadError("drills.search", error);

  return data.map(toDrillSummary);
}

/** Los objetivos de trabajo del club, en su orden: los chips del filtro y del formulario. */
export async function getFocusAreas(ctx: ClubContext): Promise<FocusArea[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("focus_areas")
    .select("id, slug, name")
    .eq("organization_id", ctx.org.id)
    .order("sort", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwReadError("drills.focus-areas", error);

  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name }));
}

/** El id de quien tiene la sesión (comprobado, no la cookie tal cual), o `null` si no hay. */
async function currentUserId(supabase: Db): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) throwReadError("drills.viewer", error);

  return data?.claims.sub ?? null;
}

/**
 * El slug de la sección publicada de The Way que lista los principios (la primera por orden
 * si hay varias), para enlazar cada principio de la ficha; `null` si el club no tiene.
 */
async function getPrinciplesSectionSlug(supabase: Db, orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("way_sections")
    .select("slug")
    .eq("organization_id", orgId)
    .eq("status", "published")
    .eq("content_kind", "principles")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throwReadError("drills.principles-section", error);

  return data?.slug ?? null;
}

/**
 * La ficha de un ejercicio por su id, con sus puntos, variantes, objetivos, principios y
 * Standards (solo lo publicado) y el diagrama firmado. También los archivados: sigue visible
 * aunque ya no salga al buscar.
 *
 * `null` si el id no es un uuid (sin consultar nada) o si la fila no llega: no existe, es de
 * otro club o RLS no la deja ver, sin distinguir un caso del otro; quien llama responde con
 * el mismo 404. Si Supabase falla, lanza.
 *
 * Los hijos (puntos, variantes, vínculos) cuelgan del ejercicio por claves compuestas con su
 * club, así que no hace falta filtrarlos por club además de por el ejercicio.
 */
export async function getDrill(ctx: ClubContext, drillId: string): Promise<DrillDetail | null> {
  if (!UUID_RE.test(drillId)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("drills")
    .select(DETAIL_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("id", drillId)
    .maybeSingle();
  if (error) throwReadError("drills.detail", error);
  if (!data) return null;

  // Tres cosas que no dependen unas de otras. Firmar el diagrama no lanza: sin objeto en
  // Storage (la ficha puede existir sin él) es `null` y la ficha sale sin diagrama.
  const diagramPath = data.media_assets?.path;
  const [userId, principlesSectionSlug, diagramUrl] = await Promise.all([
    currentUserId(supabase),
    getPrinciplesSectionSlug(supabase, ctx.org.id),
    diagramPath ? signedUrl(diagramPath) : Promise.resolve(null),
  ]);

  return toDrillDetail(data, { userId, principlesSectionSlug, diagramUrl });
}

/**
 * Lo que ofrece el formulario de un ejercicio para elegir: los objetivos del club y los
 * principios y Standards publicados, cada lista en su orden.
 */
export async function getDrillFormOptions(
  ctx: ClubContext,
): Promise<{ focusAreas: FocusArea[]; principles: GamePrinciple[]; standards: Standard[] }> {
  const [focusAreas, principles, standards] = await Promise.all([
    getFocusAreas(ctx),
    getPrinciples(ctx),
    getStandards(ctx),
  ]);

  return { focusAreas, principles, standards };
}
