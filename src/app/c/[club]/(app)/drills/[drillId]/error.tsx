"use client";

import type { ErrorInfo } from "next/error";
import { useParams } from "next/navigation";
import { ErrorState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Error de la ficha de un ejercicio: se pinta en su marco, en lugar del contenido, con la misma
 * cabecera de detalle que la página (ver `TopNavigation`: sin ella se vería la de marca) para
 * poder volver a la biblioteca. Lo que lancen los layouts no llega aquí: lo recoge
 * `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al servidor
 * y la repinta (`reset` solo repintaría lo que ya falló). El título del error es el `<h1>` de
 * la pantalla: la cabecera no es un encabezado. No lleva «Editar»: si la ficha no se ha podido
 * leer, no se sabe si quien mira puede editarla.
 *
 * Un ejercicio que no existe o que no se puede ver no llega aquí: es un 404 (`notFound()`),
 * no un fallo.
 */
export default function DrillError({ retry }: ErrorInfo) {
  const { club } = useParams<{ club: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Ejercicio" backHref={`/c/${club}/drills`} />
      <div className="px-(--space-4)">
        <ErrorState
          headingLevel={1}
          title="No se pudo cargar el ejercicio"
          body="Revisa la conexión y vuelve a intentarlo."
          onRetry={retry}
        />
      </div>
    </>
  );
}
