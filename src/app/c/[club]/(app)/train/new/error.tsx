"use client";

import type { ErrorInfo } from "next/error";
import { ErrorState } from "@/ui/states";

/**
 * Error de Nueva sesión: se pinta en su marco, en lugar del contenido (el `<main>` lo pone
 * `AppShell`), con el mismo margen que la pantalla. Es el del formulario y no el de la lista
 * (`../error.tsx`), que habla de «las sesiones». Lo que lancen los layouts no llega aquí: lo
 * recoge `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al
 * servidor y la repinta (`reset` solo repintaría lo que ya falló). El título del error es el
 * `<h1>` de la pantalla.
 */
export default function NewPracticeError({ retry }: ErrorInfo) {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <ErrorState
        headingLevel={1}
        title="No se pudo cargar el formulario"
        body="Revisa la conexión y vuelve a intentarlo."
        onRetry={retry}
      />
    </div>
  );
}
