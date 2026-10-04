import type { Database } from "@/lib/database.types";
import type { Standard } from "@/modules/methodology/types";
import type { DrillDetail, DrillSummary } from "./types";

// Lo que comparten las lecturas de la biblioteca: las columnas que se piden, la forma de las
// filas que devuelve PostgREST y el paso de fila a tipo.
//
// PostgREST no ordena lo que viene anidado, y el orden de objetivos, principios y Standards
// depende de una columna de la fila de al lado (`sort`, `number`), no de la tabla de vínculos:
// se ordena aquí, en un solo sitio, para la lista y la ficha por igual. Los puntos y las
// variantes se ordenan aquí también, por su `sort`.

type Tables = Database["public"]["Tables"];

/** Los 100 ejercicios que como mucho enseña la lista (ver `searchDrills`). */
export const SEARCH_LIMIT = 100;

/** Las columnas de la tarjeta de la lista; los objetivos van anidados por la tabla de vínculos. */
export const SUMMARY_COLUMNS = `id, title, status, created_by,
  min_age, max_age, min_players, max_players, min_minutes, max_minutes,
  drill_focus_areas(focus_areas(slug, name, sort))`;

/**
 * Las de la ficha. Los principios y los Standards piden `status`: RLS le esconde lo no
 * publicado a quien entrena (llega `null`), pero la dirección lo ve todo, y en la ficha solo
 * sale lo publicado. El diagrama anida su ficha de `media_assets` por la clave compuesta.
 */
export const DETAIL_COLUMNS = `id, title, status, created_by,
  min_age, max_age, min_players, max_players, min_minutes, max_minutes,
  summary, objective, setup_md, equipment, video_url, diagram_media_id, updated_at,
  drill_focus_areas(focus_areas(id, slug, name, sort)),
  drill_principles(game_principles(id, slug, title, sort, status)),
  drill_standards(standards(id, number, title, description, status)),
  drill_coaching_points(text, is_key, sort),
  drill_variants(title, description, sort),
  media_assets(path)`;

type DrillRow = Tables["drills"]["Row"];
type FocusEmbed = Pick<Tables["focus_areas"]["Row"], "slug" | "name" | "sort">;
type PrincipleEmbed = Pick<Tables["game_principles"]["Row"], "id" | "slug" | "title" | "sort" | "status">;
type StandardEmbed = Pick<Tables["standards"]["Row"], "id" | "number" | "title" | "description" | "status">;

// Una relación anidada que RLS no deja ver llega como `null` aunque el tipo generado diga que
// siempre hay fila: las filas anidadas aceptan `null` y se descartan al mapear.

export type SummaryRow = Pick<
  DrillRow,
  | "id"
  | "title"
  | "status"
  | "created_by"
  | "min_age"
  | "max_age"
  | "min_players"
  | "max_players"
  | "min_minutes"
  | "max_minutes"
> & { drill_focus_areas: Array<{ focus_areas: FocusEmbed | null }> };

export type DetailRow = Omit<SummaryRow, "drill_focus_areas"> &
  Pick<
    DrillRow,
    "summary" | "objective" | "setup_md" | "equipment" | "video_url" | "diagram_media_id" | "updated_at"
  > & {
    drill_focus_areas: Array<{ focus_areas: (FocusEmbed & { id: string }) | null }>;
    drill_principles: Array<{ game_principles: PrincipleEmbed | null }>;
    drill_standards: Array<{ standards: StandardEmbed | null }>;
    drill_coaching_points: Array<Pick<Tables["drill_coaching_points"]["Row"], "text" | "is_key" | "sort">>;
    drill_variants: Array<Pick<Tables["drill_variants"]["Row"], "title" | "description" | "sort">>;
    media_assets: { path: string } | null;
  };

/** Lo que la ficha necesita además de la fila, que sale de otras lecturas. */
export type DetailExtras = {
  /** Quien tiene la sesión, o `null` si Auth no devuelve a nadie. */
  userId: string | null;
  principlesSectionSlug: string | null;
  diagramUrl: string | null;
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Las filas anidadas que se ven, sin los vínculos cuya fila RLS esconde. */
function visible<L, T>(links: L[], pick: (link: L) => T | null): T[] {
  return links.flatMap((link) => {
    const item = pick(link);
    return item ? [item] : [];
  });
}

function orderedFocus<T extends FocusEmbed>(links: Array<{ focus_areas: T | null }>): T[] {
  return visible(links, (link) => link.focus_areas).sort(
    (a, b) => a.sort - b.sort || compareText(a.slug, b.slug),
  );
}

export function toDrillSummary(row: SummaryRow): DrillSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdBy: row.created_by,
    minAge: row.min_age,
    maxAge: row.max_age,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    minMinutes: row.min_minutes,
    maxMinutes: row.max_minutes,
    focus: orderedFocus(row.drill_focus_areas).map(({ slug, name }) => ({ slug, name })),
  };
}

/**
 * La ficha completa. `updatedAt` queda tal cual lo da PostgREST. Solo salen los principios y
 * los Standards publicados.
 */
export function toDrillDetail(row: DetailRow, extras: DetailExtras): DrillDetail {
  const focus = orderedFocus(row.drill_focus_areas);

  const principles = visible(row.drill_principles, (link) => link.game_principles)
    .filter((principle) => principle.status === "published")
    .sort((a, b) => a.sort - b.sort || compareText(a.id, b.id))
    .map(({ id, slug, title }) => ({ id, slug, title }));

  const standards: Standard[] = visible(row.drill_standards, (link) => link.standards)
    .filter((standard) => standard.status === "published")
    .sort((a, b) => a.number - b.number)
    .map(({ id, number, title, description }) => ({ id, number, title, description }));

  return {
    ...toDrillSummary(row),
    summary: row.summary,
    objective: row.objective,
    setupMd: row.setup_md,
    equipment: row.equipment,
    videoUrl: row.video_url,
    diagramMediaId: row.diagram_media_id,
    diagramUrl: extras.diagramUrl,
    coachingPoints: [...row.drill_coaching_points]
      .sort((a, b) => a.sort - b.sort)
      .map((point) => ({ text: point.text, isKey: point.is_key })),
    variants: [...row.drill_variants]
      .sort((a, b) => a.sort - b.sort)
      .map((variant) => ({ title: variant.title, description: variant.description })),
    focusAreaIds: focus.map((area) => area.id),
    principles,
    principlesSectionSlug: extras.principlesSectionSlug,
    standards,
    createdByMe: extras.userId !== null && row.created_by === extras.userId,
    updatedAt: row.updated_at,
  };
}
