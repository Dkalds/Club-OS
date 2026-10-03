import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega una pantalla de The Way (el índice, una sección o los
 * Standards, que cuelgan del mismo segmento): el esqueleto de una lista, dentro de su marco.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function WayLoading() {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <LoadingState rows={5} />
    </div>
  );
}
