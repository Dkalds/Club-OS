import type { ReactNode } from "react";

/**
 * La etiqueta de objetivo de una card (`tag` de design/components/Filter): no es interactiva,
 * mide `min-h-6` y usa `radius-xs`. Las medidas de design/components/bundle.css
 * (`.cos-chip--tag`: 12px) no tienen estilo de texto de token.
 *
 * Sin `"use client"` a propósito: no tiene comportamiento, y `DrillCard` (de servidor) la
 * repite en cada fila. Se importa de aquí; `./filter` la re-exporta junto a los chips.
 */
export function FilterTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-(--space-1) rounded-xs border border-line bg-surface-2 px-(--space-2) text-[12px] leading-4 font-semibold whitespace-nowrap text-ink-2">
      {children}
    </span>
  );
}
