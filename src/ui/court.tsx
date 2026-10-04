"use client";

import { useState } from "react";

// `"use client"` es por `CourtDiagram`, que necesita saber si su imagen ha fallado.
// `CourtThumb` es pura: sirve igual desde un componente de servidor.

export type CourtSize = "thumb" | "full";

// Miniatura: 80×60, `surface-2`, `radius-sm`. A tamaño completo: 4:3 en `surface-1`, con el
// borde y el radio de una card (design/README.md, «Diagramas de pista»).
const BOX: Record<CourtSize, string> = {
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
 */
export function CourtThumb({ size = "thumb" }: { size?: CourtSize }) {
  return (
    <svg
      role="img"
      aria-label="Pista sin diagrama"
      focusable="false"
      viewBox="0 0 80 60"
      fill="none"
      strokeWidth={1.2}
      className={`${BOX[size]} stroke-ink-3`}
    >
      <rect x="4" y="4" width="72" height="52" rx="2" vectorEffect="non-scaling-stroke" />
      <rect x="30" y="4" width="20" height="22" vectorEffect="non-scaling-stroke" />
      <circle cx="40" cy="26" r="8" vectorEffect="non-scaling-stroke" />
      <path d="M10 4v12a30 30 0 0 0 60 0V4" vectorEffect="non-scaling-stroke" />
      <circle cx="40" cy="9" r="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * El diagrama de un ejercicio a tamaño completo: la imagen en una caja 4:3, o la pista vacía
 * si no hay diagrama.
 *
 * `src` es una URL firmada de Supabase Storage que caduca a los 10 minutos: por eso es un
 * `<img>` normal y no `next/image`, que la pasaría por su optimizador y cachearía una URL que
 * ya no sirve. La caja tiene siempre la misma forma, con imagen o sin ella, así que la
 * pantalla no salta cuando carga.
 *
 * Si la imagen no se puede cargar (URL caducada, objeto que ya no existe), en vez del icono
 * de imagen rota se ve la pista vacía. Un `src` nuevo vuelve a intentarlo. El error puede
 * haberse producido antes de que React enganche el manejador (el HTML del servidor ya trae
 * la imagen): por eso también se mira, al enganchar, si el navegador ya la dio por rota.
 */
export function CourtDiagram({ src, alt }: { src: string | null; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <CourtThumb size="full" />;

  return (
    <div className={`${BOX.full} overflow-hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de 10 min: next/image la cachearía */}
      <img
        ref={(image) => {
          if (image?.complete && image.naturalWidth === 0) setFailedSrc(src);
        }}
        src={src}
        alt={alt}
        decoding="async"
        onError={() => setFailedSrc(src)}
        className="size-full object-contain"
      />
    </div>
  );
}
