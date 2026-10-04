"use client";

import type { ErrorInfo } from "next/error";
import { useParams } from "next/navigation";
import { ErrorState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Error del formulario de edición de un ejercicio: se pinta en su marco, en lugar del contenido,
 * con la misma cabecera de detalle que la página («Editar ejercicio», que vuelve a la ficha; ver
 * `TopNavigation`: sin ella se vería la de la ficha, que es la del `error.tsx` del que cuelga
 * esta ruta). Lo que lancen los layouts no llega aquí: lo recoge `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al servidor y
 * la repinta (`reset` solo repintaría lo que ya falló). El título del error es el `<h1>` de la
 * pantalla: la cabecera no es un encabezado.
 *
 * Un ejercicio que no existe o que no se puede editar no llega aquí: es un 404 (`notFound()`),
 * no un fallo.
 */
export default function EditDrillError({ retry }: ErrorInfo) {
  const { club, drillId } = useParams<{ club: string; drillId: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Editar ejercicio" backHref={`/c/${club}/drills/${drillId}`} />
      <div className="px-(--space-4)">
        <ErrorState
          headingLevel={1}
          title="No se pudo cargar el formulario"
          body="Revisa la conexión y vuelve a intentarlo."
          onRetry={retry}
        />
      </div>
    </>
  );
}
