"use client";

import type { ErrorInfo } from "next/error";
import { ErrorState } from "@/ui/states";

/**
 * Página de error de toda la app: lo que se ve cuando algo falla fuera del marco de un club.
 *
 * Es la que recoge los errores del layout de `/c/[club]` (Supabase caído al resolver el
 * club): el error de un layout sube al límite del segmento de ARRIBA, no al `error.tsx` de
 * su misma carpeta. También los de `/select-club` y `/login`.
 *
 * Como el 404, es de plataforma y no recibe ni enseña nada de ningún club. Tampoco el
 * mensaje del error ni su `digest`: pueden llevar datos técnicos o personales.
 *
 * `retry` vuelve a pedir la ruta al servidor y la repinta (`reset` solo repintaría lo que
 * ya falló).
 */
export default function AppError({ retry }: ErrorInfo) {
  return (
    <main className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-(--space-6) py-(--space-12)">
      <p className="px-(--space-4) font-display text-title uppercase text-ink-2">CLUB OS</p>
      <div className="px-(--space-4)">
        <ErrorState
          headingLevel={1}
          title="No se pudo cargar la página"
          body="Revisa la conexión y vuelve a intentarlo."
          onRetry={retry}
        />
      </div>
    </main>
  );
}
