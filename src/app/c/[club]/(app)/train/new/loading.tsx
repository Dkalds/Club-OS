import { LoadingState } from "@/ui/states";

/**
 * Lo que se ve mientras llega el formulario de una sesión nueva (los equipos y los objetivos
 * que ofrece): un esqueleto de cinco filas, con el mismo margen que el contenido, dentro de su
 * marco. Es el suyo y no el de la lista de sesiones (`../loading.tsx`), que no se parece.
 *
 * Next lo pinta en cuanto el layout ha resuelto el club, así que un club ajeno o que no
 * existe sigue respondiendo 404 antes de que salga nada.
 */
export default function NewPracticeLoading() {
  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <LoadingState rows={5} />
    </div>
  );
}
