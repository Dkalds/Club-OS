import { PageNotFound } from "@/ui/page-not-found";

/**
 * 404 de una página de dentro de un club (un `notFound()` lanzado por una página). Se
 * pinta dentro del marco del club, que ya pone el `<main>`.
 *
 * El `notFound()` del propio layout (club ajeno o inexistente) no llega aquí: lo recoge
 * `src/app/not-found.tsx`, fuera del marco. Los dos pintan el mismo contenido.
 */
export default function ClubNotFound() {
  return (
    <div className="pt-(--space-6)">
      <PageNotFound />
    </div>
  );
}
