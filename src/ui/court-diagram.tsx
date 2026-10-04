"use client";

import { useState } from "react";
import { COURT_BOX, CourtThumb } from "./court-thumb";

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
 *
 * Es de cliente por ese estado (`onError`); `CourtThumb`, que es pura, vive en su archivo.
 * Se importa de `./court`, que re-exporta las dos.
 */
export function CourtDiagram({ src, alt }: { src: string | null; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <CourtThumb size="full" />;

  return (
    <div className={`${COURT_BOX.full} overflow-hidden`}>
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
