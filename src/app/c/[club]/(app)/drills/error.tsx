"use client";

import type { ErrorInfo } from "next/error";
import { useParams } from "next/navigation";
import { ErrorState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Error de la biblioteca: se pinta en su marco, en lugar del contenido, con la misma cabecera
 * de detalle que la página (ver `TopNavigation`: sin ella se vería la de marca) para poder
 * volver a Entrenar. Lo que lancen los layouts no llega aquí: lo recoge `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al
 * servidor y la repinta (`reset` solo repintaría lo que ya falló). El título del error es el
 * `<h1>` de la pantalla: la cabecera no es un encabezado.
 */
export default function DrillsError({ retry }: ErrorInfo) {
  const { club } = useParams<{ club: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Biblioteca" backHref={`/c/${club}/train`} />
      <div className="px-(--space-4)">
        <ErrorState
          headingLevel={1}
          title="No se pudo cargar la biblioteca"
          body="Revisa la conexión y vuelve a intentarlo."
          onRetry={retry}
        />
      </div>
    </>
  );
}
