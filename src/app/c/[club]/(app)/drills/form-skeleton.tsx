// Los bloques del esqueleto: el color y el pulso de los del de las listas (`LoadingState`) y de
// la ficha; el pulso solo corre si la persona no ha pedido menos movimiento. El radio lo pone
// cada bloque: dos utilidades de radio en un elemento las gana la que Tailwind escriba la última.
const BLOCK = "bg-surface-2 motion-safe:animate-pulse";

/** Una etiqueta y su campo, a la altura de un control (`target-min`) o de un área de texto. */
function FieldBlock({ tall = false }: { tall?: boolean }) {
  return (
    <span className="flex flex-col gap-(--space-2)">
      <span className={`${BLOCK} h-3 w-1/4 rounded-sm`} />
      <span className={`${BLOCK} ${tall ? "h-24" : "h-11"} w-full rounded-md`} />
    </span>
  );
}

/**
 * Lo que se ve mientras llega el formulario de un ejercicio (el de alta y el de edición): un
 * esqueleto con su forma (campos de una línea, áreas de texto, dos números lado a lado y una
 * fila de chips), dentro de su marco. Las cabeceras las pone cada `loading.tsx`.
 *
 * Como `LoadingState`, es un contenedor ocupado (`aria-busy`) llamado «Cargando», y los
 * bloques son decorativos.
 */
export function DrillFormSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando" className="px-(--space-4)">
      <div aria-hidden="true" className="flex flex-col gap-(--space-5)">
        <FieldBlock />
        <FieldBlock tall />
        <FieldBlock tall />
        <span className="grid grid-cols-2 gap-(--space-3)">
          <FieldBlock />
          <FieldBlock />
        </span>
        <span className="flex flex-col gap-(--space-2)">
          <span className={`${BLOCK} h-3 w-1/4 rounded-sm`} />
          <span className="flex gap-(--space-2)">
            <span className={`${BLOCK} h-9 w-20 rounded-pill`} />
            <span className={`${BLOCK} h-9 w-24 rounded-pill`} />
            <span className={`${BLOCK} h-9 w-16 rounded-pill`} />
          </span>
        </span>
        <FieldBlock tall />
      </div>
    </div>
  );
}
