// Contrato de datos de la metodología del club. Las fases siguientes importan estos tipos:
// no cambies nombres, campos ni orden sin tocar el contrato entre fases.

export type ContentStatus = "draft" | "published";

/** Qué pinta una sección de The Way además de su texto. */
export type ContentKind = "text" | "values" | "principles" | "standards";

/** Las cuatro listas que se reordenan en Gestión (`reorder_methodology`). */
export type MethodologyKind = "way_sections" | "club_values" | "game_principles" | "standards";

/** Cómo se llama cada tipo de contenido en el selector de Gestión. */
export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  text: "Texto",
  values: "Valores",
  principles: "Principios",
  standards: "Standards",
};

/**
 * Una sección de The Way. `number` es su posición en Gestión. `updatedAt` es el texto tal
 * cual lo devuelve PostgREST (con microsegundos): sirve de `expectedUpdatedAt` al guardar y
 * no debe pasar nunca por `Date`.
 */
export type WaySection = {
  id: string;
  number: number;
  slug: string;
  title: string;
  summary: string | null;
  bodyMd: string;
  contentKind: ContentKind;
  status: ContentStatus;
  updatedAt: string;
};

export type ClubValue = {
  id: string;
  code: string;
  title: string | null;
  description: string;
  status: ContentStatus;
};

export type PrinciplePoint = { id: string; text: string };

export type GamePrinciple = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: ContentStatus;
  points: PrinciplePoint[];
};

/** Un Standard del club. `number` lo elige la dirección y es único por club. */
export type Standard = { id: string; number: number; title: string; description: string };

export type AdminStandard = Standard & { status: ContentStatus };

/** Una fila del índice de The Way. */
export type WayIndexEntry = {
  id: string;
  number: number;
  slug: string;
  title: string;
  subtitle: string | null;
};

/** Una sección con la lista que le toca según su `contentKind`; las demás van vacías. */
export type WaySectionView = {
  section: WaySection;
  values: ClubValue[];
  principles: GamePrinciple[];
  standards: Standard[];
};
