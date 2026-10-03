"use client";

import type { ErrorInfo } from "next/error";
import { ErrorState } from "@/ui/states";

/**
 * Error de una pantalla de The Way (el índice, una sección o los Standards): se pinta en su
 * marco, en lugar del contenido. Lo que lancen los layouts no llega aquí: lo recoge
 * `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al
 * servidor y la repinta (`reset` solo repintaría lo que ya falló).
 */
export default function WayError({ retry }: ErrorInfo) {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <ErrorState
        headingLevel={1}
        title="No se pudo cargar la metodología"
        body="Revisa la conexión y vuelve a intentarlo."
        onRetry={retry}
      />
    </div>
  );
}
