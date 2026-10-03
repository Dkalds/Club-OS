"use client";

import type { ErrorInfo } from "next/error";
import { usePathname } from "next/navigation";
import { ErrorState } from "@/ui/states";

/** `/c/{slug}`, con o sin barra final: Inicio. */
const HOME_PATH = /^\/c\/[^/]+\/?$/;

/**
 * Error de una pantalla de la app móvil del club: se pinta en su marco, en lugar del
 * contenido (el `<main>` lo pone `AppShell`).
 *
 * Recoge lo que lanzan las páginas de `(app)` (Inicio, si no se pueden leer sus datos, y
 * también las pestañas, que cuelgan de este mismo segmento): por eso el título solo habla
 * de Inicio cuando la ruta es la de Inicio. Lo que lancen los layouts no llega aquí: lo
 * recoge `src/app/error.tsx`. Gestión tiene el suyo (`admin/error.tsx`).
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al
 * servidor y la repinta (`reset` solo repintaría lo que ya falló).
 */
export default function ClubError({ retry }: ErrorInfo) {
  const onHome = HOME_PATH.test(usePathname());

  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <ErrorState
        headingLevel={1}
        title={onHome ? "No se pudo cargar tu inicio" : "No se pudo cargar la página"}
        body="Revisa la conexión y vuelve a intentarlo."
        onRetry={retry}
      />
    </div>
  );
}
