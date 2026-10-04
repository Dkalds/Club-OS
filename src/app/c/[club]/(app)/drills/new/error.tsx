"use client";

import type { ErrorInfo } from "next/error";
import { useParams } from "next/navigation";
import { ErrorState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Error del formulario de un ejercicio nuevo: se pinta en su marco, en lugar del contenido, con
 * la misma cabecera de detalle que la página («Nuevo ejercicio», que vuelve a la biblioteca; ver
 * `TopNavigation`: sin ella se vería la de la biblioteca, que es la del `error.tsx` del que
 * cuelga esta ruta). Lo que lancen los layouts no llega aquí: lo recoge `src/app/error.tsx`.
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al servidor y
 * la repinta (`reset` solo repintaría lo que ya falló). El título del error es el `<h1>` de la
 * pantalla: la cabecera no es un encabezado.
 *
 * Quien no puede crear ejercicios no llega aquí: es un 404 (`notFound()`), no un fallo.
 */
export default function NewDrillError({ retry }: ErrorInfo) {
  const { club } = useParams<{ club: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Nuevo ejercicio" backHref={`/c/${club}/drills`} />
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
