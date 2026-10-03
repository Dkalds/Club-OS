import { PageNotFound } from "@/ui/page-not-found";

/**
 * 404 de una pantalla de la app móvil del club (un `notFound()` lanzado por una página de
 * `(app)`). Se pinta dentro de su marco, que ya pone el `<main>`.
 *
 * Lo que lanzan el layout de `/c/[club]` (club ajeno o inexistente) y Gestión no llega
 * aquí: lo primero lo recoge `src/app/not-found.tsx`, fuera del marco, y lo segundo, que
 * no cuelga de este marco, `../not-found.tsx`. Los tres pintan el mismo contenido.
 */
export default function AppNotFound() {
  return (
    <div className="pt-(--space-6)">
      <PageNotFound />
    </div>
  );
}
