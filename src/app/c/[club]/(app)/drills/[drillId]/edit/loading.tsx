"use client";

import { useParams } from "next/navigation";
import { TopNavigation } from "@/ui/top-navigation";
import { DrillFormSkeleton } from "../../form-skeleton";

/**
 * Lo que se ve mientras llega el formulario de edición de un ejercicio: la misma cabecera de
 * detalle que pinta la página («Editar ejercicio», que vuelve a la ficha) y el esqueleto de un
 * formulario, dentro de su marco.
 *
 * Esta ruta cuelga de la ficha, cuyo `loading.tsx` tiene la forma de la ficha y la cabecera
 * «Ejercicio»: sin éste se vería esa, y al llegar la página la cabecera cambiaría de título y de
 * destino (ver `TopNavigation`). Un `loading.tsx` no recibe parámetros, así que el club y el
 * ejercicio salen de la ruta (`useParams`) y por eso es de cliente.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no existe
 * sigue respondiendo 404 antes de que salga nada.
 */
export default function EditDrillLoading() {
  const { club, drillId } = useParams<{ club: string; drillId: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Editar ejercicio" backHref={`/c/${club}/drills/${drillId}`} />
      <DrillFormSkeleton />
    </>
  );
}
