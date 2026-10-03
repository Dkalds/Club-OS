"use client";

import type { ErrorInfo } from "next/error";
import { ErrorState } from "@/ui/states";

/**
 * Error de una página de Gestión: se pinta en su marco, en lugar del contenido (el
 * `<main>` lo pone `AdminShell`). Lo que lance el layout no llega aquí: lo recoge
 * `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al
 * servidor y la repinta (`reset` solo repintaría lo que ya falló).
 */
export default function AdminError({ retry }: ErrorInfo) {
  return (
    <ErrorState
      headingLevel={1}
      title="No se pudo cargar Gestión"
      body="Revisa la conexión y vuelve a intentarlo."
      onRetry={retry}
    />
  );
}
