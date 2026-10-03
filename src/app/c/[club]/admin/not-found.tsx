import { PageNotFound } from "@/ui/page-not-found";

/**
 * 404 de una página de Gestión que no existe (un `notFound()` lanzado por una página de
 * `admin`, como un editor con un id que no es de este club). Se pinta dentro del marco de
 * Gestión, que ya pone el `<main>`, la cabecera y la navegación: así quien administra no se
 * queda sin ellos ni con una sola salida, «Volver a tus clubes».
 *
 * Lo que lanza el layout de Gestión (quien no administra) no llega aquí: un `not-found.tsx`
 * no recoge lo que lanza el layout de su propia carpeta, y lo recoge `../not-found.tsx`, sin
 * marco de ninguna área. Los tres 404 de un club pintan el mismo contenido.
 */
export default function AdminNotFound() {
  // `PageNotFound` trae su margen lateral (en la app móvil, `<main>` no lo pone); el `<main>` de
  // Gestión sí, y se anula aquí para que no se sume.
  return (
    <div className="-mx-(--space-4)">
      <PageNotFound />
    </div>
  );
}
