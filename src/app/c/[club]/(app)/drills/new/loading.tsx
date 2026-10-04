"use client";

import { useParams } from "next/navigation";
import { TopNavigation } from "@/ui/top-navigation";
import { DrillFormSkeleton } from "../form-skeleton";

/**
 * Lo que se ve mientras llega el formulario de un ejercicio nuevo: la misma cabecera de detalle
 * que pinta la página («Nuevo ejercicio», que vuelve a la biblioteca) y el esqueleto de un
 * formulario, dentro de su marco.
 *
 * Esta ruta cuelga de la biblioteca, cuyo `loading.tsx` tiene la forma de una lista y la
 * cabecera «Biblioteca»: sin éste se vería esa, y al llegar la página la cabecera cambiaría de
 * título (ver `TopNavigation`). Un `loading.tsx` no recibe parámetros, así que el club sale de la
 * ruta (`useParams`) y por eso es de cliente.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no existe
 * sigue respondiendo 404 antes de que salga nada.
 */
export default function NewDrillLoading() {
  const { club } = useParams<{ club: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Nuevo ejercicio" backHref={`/c/${club}/drills`} />
      <DrillFormSkeleton />
    </>
  );
}
