export type CourtSize = "thumb" | "full";

// Miniatura: 80×60, `surface-2`, `radius-sm`. A tamaño completo: 4:3 en `surface-1`, con el
// borde y el radio de una card (design/README.md, «Diagramas de pista»). La caja de
// `CourtDiagram` es la de `full`: con imagen o sin ella mide lo mismo.
export const COURT_BOX: Record<CourtSize, string> = {
  thumb: "h-15 w-20 shrink-0 rounded-sm bg-surface-2",
  full: "aspect-4/3 w-full rounded-lg border border-line bg-surface-1",
};

/**
 * La pista vacía del producto (design/components/DrillCard): solo las líneas, en `ink-3`, sin
 * jugadores ni movimientos. Es lo que se ve cuando un ejercicio no tiene diagrama.
 *
 * `thumb` mide 80×60 y es la miniatura de una fila; `full` ocupa todo el ancho en 4:3, que es
 * la proporción del diagrama. El dibujo es el mismo y escala con la caja. Las líneas no
 * engordan al agrandarse (`non-scaling-stroke`): 1.2px en cualquier tamaño, como en la
 * miniatura de design/components/bundle.css.
 *
 * Sola es una imagen con nombre («Pista sin diagrama»). Con `decorative` no dice nada y se
 * esconde a los lectores de pantalla: es el hueco de la miniatura de una fila de lista, donde
 * no se cargan diagramas (el ejercicio puede tenerlo) y ese nombre se leería en cada fila,
 * delante del título.
 *
 * Sin `"use client"` a propósito: es pura, y `DrillCard` (de servidor) la importa de aquí y no
 * de `./court`, que re-exporta `CourtDiagram`, un componente de cliente.
 */
export function CourtThumb({
  size = "thumb",
  decorative = false,
}: {
  size?: CourtSize;
  decorative?: boolean;
}) {
  return (
    <svg
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": "Pista sin diagrama" })}
      focusable="false"
      viewBox="0 0 80 60"
      fill="none"
      strokeWidth={1.2}
      className={`${COURT_BOX[size]} stroke-ink-3`}
    >
      <rect x="4" y="4" width="72" height="52" rx="2" vectorEffect="non-scaling-stroke" />
      <rect x="30" y="4" width="20" height="22" vectorEffect="non-scaling-stroke" />
      <circle cx="40" cy="26" r="8" vectorEffect="non-scaling-stroke" />
      <path d="M10 4v12a30 30 0 0 0 60 0V4" vectorEffect="non-scaling-stroke" />
      <circle cx="40" cy="9" r="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
