import type { ReactNode } from "react";

// Lo que comparten las pantallas de la estructura del club en Gestión.

/** El encabezado de una card o de un bloque de estas pantallas: el `<h2>` bajo el `<h1>` de la página. */
export const BLOCK_HEADING_CLASS = "min-w-0 font-display text-title wrap-break-word uppercase";

/**
 * Lo que llega de un campo numérico: vacío es «sin valor» (`null`); lo demás, el número, que
 * valida el esquema de la acción (un texto que no es un número viaja como `NaN` y se rechaza
 * allí, con su mensaje).
 */
export function toNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** «1 jugador», «12 jugadores». */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Una etiqueta corta junto a un nombre: «Actual», «Archivada». Nunca solo color: lleva su palabra. */
export function Pill({ tone = "accent", children }: { tone?: "accent" | "muted"; children: ReactNode }) {
  const color = tone === "accent" ? "bg-brand-accent-soft text-brand-accent" : "bg-surface-2 text-ink-2";

  return (
    <span className={`inline-flex shrink-0 items-center rounded-pill px-(--space-2) text-label uppercase ${color}`}>
      {children}
    </span>
  );
}
