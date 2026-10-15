import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega la agenda: el esqueleto de una lista de cuatro filas, con el
 * mismo margen que el contenido, dentro de su marco.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function AgendaLoading() {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <LoadingState rows={4} />
    </div>
  );
}
