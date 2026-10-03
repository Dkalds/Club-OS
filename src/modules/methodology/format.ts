import type { ContentKind } from "./types";

/** El número de un Standard o de una sección como se pinta: «03». */
export function formatStandardNumber(n: number): string {
  return String(n).padStart(2, "0");
}

/** Singular y plural de lo que cuenta cada tipo de sección que no es de texto. */
const UNITS = {
  values: ["valor", "valores"],
  principles: ["principio", "principios"],
  standards: ["Standard", "Standards"],
} as const satisfies Record<Exclude<ContentKind, "text">, readonly [string, string]>;

/**
 * La línea de apoyo de una sección en el índice de The Way.
 *
 * Una sección de texto enseña su resumen. Las demás cuentan lo que el club tiene publicado
 * en su lista («3 valores», «1 Standard»), y sin nada dicen que está vacía. Solo se mira la
 * lista del tipo de la sección.
 */
export function sectionSubtitle(
  kind: ContentKind,
  summary: string | null,
  counts: { values: number; principles: number; standards: number },
): string | null {
  if (kind === "text") return summary;

  const total = counts[kind];
  if (total === 0) return "Sin contenido todavía";

  const [singular, plural] = UNITS[kind];
  return `${total} ${total === 1 ? singular : plural}`;
}
