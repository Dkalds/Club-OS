import { PageNotFound } from "@/ui/page-not-found";

/**
 * 404 de toda la app: rutas que no existen y, sobre todo, el `notFound()` del layout de
 * `/c/[club]`. Next lo pinta en lugar del layout que lo lanzó, así que aquí no hay ni
 * `data-club`, ni colores, ni nombre de ningún club: un club ajeno y uno que no existe
 * dan exactamente esta misma página.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-(--space-6) py-(--space-12)">
      <p className="px-(--space-4) font-display text-title uppercase text-ink-2">CLUB OS</p>
      <PageNotFound />
    </main>
  );
}
