import { PageNotFound } from "@/ui/page-not-found";

/**
 * 404 de una pantalla de la app móvil del club (un `notFound()` lanzado por una página de
 * `(app)`). Se pinta dentro de su marco, que ya pone el `<main>`.
 *
 * Lo que lanzan el layout de `/c/[club]` (club ajeno o inexistente) y Gestión no llega
 * aquí: lo primero lo recoge `src/app/not-found.tsx`, fuera del marco; lo que lanza una
 * página de Gestión, `../admin/not-found.tsx`, dentro del marco de Gestión; y lo que lanza
 * el layout de Gestión (quien no administra), `../not-found.tsx`. Los cuatro pintan el mismo
 * contenido.
 */
export default function AppNotFound() {
  return (
    <div className="pt-(--space-6)">
      <PageNotFound />
    </div>
  );
}
