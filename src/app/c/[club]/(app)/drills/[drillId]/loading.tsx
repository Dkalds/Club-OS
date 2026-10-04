"use client";

import { useParams } from "next/navigation";
import { TopNavigation } from "@/ui/top-navigation";

// Los bloques del esqueleto: el color y el pulso de los del de las listas (`LoadingState`); el
// pulso solo corre si la persona no ha pedido menos movimiento. El radio lo pone cada bloque:
// dos utilidades de radio en un elemento las gana la que Tailwind escriba la última.
const BLOCK = "bg-surface-2 motion-safe:animate-pulse";

/**
 * Lo que se ve mientras llega la ficha de un ejercicio: la misma cabecera de detalle que pinta
 * la página y un esqueleto con su forma (título, píldoras, diagrama y unas líneas de texto),
 * dentro de su marco.
 *
 * Sin la cabecera se vería la de marca del club mientras carga y, al llegar la página, el
 * cambio a la de detalle (ver `TopNavigation`). Un `loading.tsx` no recibe parámetros, así que
 * el club sale de la ruta (`useParams`) y por eso es de cliente. No lleva «Editar»: aún no se
 * sabe si quien mira puede editar.
 *
 * Como `LoadingState`, es un contenedor ocupado (`aria-busy`) llamado «Cargando», y los
 * bloques son decorativos. Next lo pinta en cuanto el layout ha resuelto el club, así que un
 * club ajeno o que no existe sigue respondiendo 404 antes de que salga nada.
 */
export default function DrillLoading() {
  const { club } = useParams<{ club: string }>();

  return (
    <>
      <TopNavigation variant="detail" title="Ejercicio" backHref={`/c/${club}/drills`} />
      <div role="status" aria-busy="true" aria-label="Cargando" className="px-(--space-4)">
        <div aria-hidden="true" className="flex flex-col gap-(--space-6)">
          <div className="flex flex-col gap-(--space-3)">
            <span className={`${BLOCK} h-8 w-7/10 rounded-sm`} />
            <span className="flex gap-(--space-2)">
              <span className={`${BLOCK} h-8 w-16 rounded-pill`} />
              <span className={`${BLOCK} h-8 w-28 rounded-pill`} />
              <span className={`${BLOCK} h-8 w-28 rounded-pill`} />
            </span>
          </div>
          <span className={`${BLOCK} aspect-4/3 w-full rounded-lg`} />
          <div className="flex flex-col gap-(--space-2)">
            <span className={`${BLOCK} h-4 w-1/3 rounded-sm`} />
            <span className={`${BLOCK} h-4 w-full rounded-sm`} />
            <span className={`${BLOCK} h-4 w-17/20 rounded-sm`} />
          </div>
        </div>
      </div>
    </>
  );
}
