"use client";

import { useParams } from "next/navigation";
import { LoadingState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Lo que se ve mientras llega la biblioteca: la misma cabecera de detalle que pinta la página
 * y el esqueleto de una lista, dentro de su marco.
 *
 * Sin la cabecera se vería la de marca del club mientras carga y, al llegar la página, el
 * cambio a la de detalle (ver `TopNavigation`). Un `loading.tsx` no recibe parámetros, así que
 * el club sale de la ruta (`useParams`) y por eso es de cliente. No lleva «Nuevo»: aún no se
 * sabe si quien mira puede crear.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function DrillsLoading() {
  const { club } = useParams<{ club: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Biblioteca" backHref={`/c/${club}/train`} />
      <div className="px-(--space-4)">
        <LoadingState rows={6} />
      </div>
    </>
  );
}
