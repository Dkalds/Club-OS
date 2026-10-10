"use client";

import { useParams } from "next/navigation";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Lo que se ve mientras llega el editor de la pizarra: la misma cabecera de detalle que pinta la
 * página («Pizarra», que vuelve a la ficha) y el hueco de la pista, con su proporción.
 *
 * Esta ruta cuelga de la ficha, cuyo `loading.tsx` tiene la cabecera «Ejercicio»: sin este se
 * vería esa, y al llegar la página la cabecera cambiaría de título (ver `TopNavigation`). Un
 * `loading.tsx` no recibe parámetros, así que el club y el ejercicio salen de la ruta
 * (`useParams`) y por eso es de cliente.
 */
export default function DrillBoardLoading() {
  const { club, drillId } = useParams<{ club: string; drillId: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Pizarra" backHref={`/c/${club}/drills/${drillId}`} />
      <div aria-busy="true" className="flex flex-col gap-(--space-4) px-(--space-4)">
        <p className="sr-only">Cargando la pizarra</p>
        <div className="aspect-4/3 w-full rounded-lg border border-line bg-surface-1" />
        <div className="h-9 w-2/3 rounded-pill bg-surface-2" />
        <div className="h-(--target-min) w-full rounded-md bg-surface-2" />
      </div>
    </>
  );
}
