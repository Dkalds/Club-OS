import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega una pantalla del club (Inicio y, al colgar del mismo
 * segmento, también las pestañas): el esqueleto, dentro del marco del club.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function ClubLoading() {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <LoadingState />
    </div>
  );
}
