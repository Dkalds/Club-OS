import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega el constructor de una sesión: el esqueleto de la lista de sus
 * ejercicios (cinco filas, lo habitual de una sesión), con el mismo margen que el contenido,
 * dentro de su marco.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function EditPracticeLoading() {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <LoadingState rows={5} />
    </div>
  );
}
