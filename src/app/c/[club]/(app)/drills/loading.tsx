import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega la biblioteca: el esqueleto de una lista de seis filas, con el
 * mismo margen que el contenido, dentro de su marco. Es el inicio de una sección: lleva la
 * cabecera de marca, como la página.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function DrillsLoading() {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <LoadingState rows={6} />
    </div>
  );
}
