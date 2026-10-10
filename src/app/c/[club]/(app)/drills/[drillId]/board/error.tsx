"use client";

import type { ErrorInfo } from "next/error";
import { useParams } from "next/navigation";
import { ErrorState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Error del editor de la pizarra: se pinta en su marco, en lugar del contenido, con la misma
 * cabecera de detalle que la página («Pizarra», que vuelve a la ficha; ver `TopNavigation`).
 *
 * Nunca enseña el mensaje del error ni su `digest`. `retry` vuelve a pedir la ruta al servidor.
 * El título del error es el `<h1>` de la pantalla: la cabecera no es un encabezado. Un ejercicio
 * que no existe o que no se puede editar no llega aquí: es un 404 (`notFound()`), no un fallo.
 */
export default function DrillBoardError({ retry }: ErrorInfo) {
  const { club, drillId } = useParams<{ club: string; drillId: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Pizarra" backHref={`/c/${club}/drills/${drillId}`} />
      <div className="px-(--space-4)">
        <ErrorState
          headingLevel={1}
          title="No se pudo cargar la pizarra"
          body="Revisa la conexión y vuelve a intentarlo."
          onRetry={retry}
        />
      </div>
    </>
  );
}
