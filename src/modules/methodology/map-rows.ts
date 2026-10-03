import type { Database } from "@/lib/database.types";
import { logError } from "@/lib/log";
import {
  CONTENT_KIND_LABELS,
  type ClubValue,
  type ContentKind,
  type GamePrinciple,
  type Standard,
  type WaySection,
} from "./types";

// Lo que comparten las lecturas de la metodología (`queries.ts`, para quien entrena, y
// `admin-queries.ts`, para Gestión): las columnas que se piden, la forma de las filas que
// devuelve PostgREST, el paso de fila a tipo y el error de lectura. Con una sola copia, Gestión
// y The Way no se desincronizan.

type Tables = Database["public"]["Tables"];

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
export type ValueRow = Pick<
  Tables["club_values"]["Row"],
  "id" | "code" | "title" | "description" | "status"
>;
export type PrincipleRow = Pick<
  Tables["game_principles"]["Row"],
  "id" | "slug" | "title" | "summary" | "status"
> & { principle_points: Array<Pick<Tables["principle_points"]["Row"], "id" | "text">> | null };
export type StandardRow = Pick<
  Tables["standards"]["Row"],
  "id" | "number" | "title" | "description" | "status"
>;

export const SECTION_COLUMNS =
  "id, number, slug, title, summary, body_md, content_kind, status, updated_at";
export const VALUE_COLUMNS = "id, code, title, description, status";
/**
 * Los puntos van embebidos; quien lee tiene que filtrarlos por club y ordenarlos
 * (`principle_points.organization_id`, `sort`, `created_at`, `id`).
 */
export const PRINCIPLE_COLUMNS =
  "id, slug, title, summary, status, principle_points(id, text)";
export const STANDARD_COLUMNS = "id, number, title, description, status";

/**
 * Un error de lectura de Supabase no se traga ni se convierte en datos vacíos: se registra
 * (sin datos personales, ver `logError`) y se lanza para que lo recoja el error de la página.
 * No se adjunta como `cause`: su mensaje puede llevar el contenido de una fila.
 *
 * Siempre lanza: no devuelve un resultado, a diferencia de `fail` de `@/lib/action-result`,
 * que es el de las acciones.
 */
export function throwReadError(tag: string, error: unknown): never {
  logError(tag, error);
  throw new Error(`${tag}: no se pudo leer de la base de datos`);
}

/** La columna es un texto libre con un CHECK; lo que no se reconozca se pinta como texto. */
export function toContentKind(value: string): ContentKind {
  const kinds = Object.keys(CONTENT_KIND_LABELS) as ContentKind[];
  return kinds.find((kind) => kind === value) ?? "text";
}

/** `updatedAt` queda tal cual lo da PostgREST. */
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

export function toClubValue(row: ValueRow): ClubValue {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    status: row.status,
  };
}

/** Los puntos ya vienen ordenados de la consulta. */
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

export function toStandard(row: StandardRow): Standard {
  return { id: row.id, number: row.number, title: row.title, description: row.description };
}
