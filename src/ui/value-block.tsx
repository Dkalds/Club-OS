import type { ClubValue } from "@/modules/methodology/types";
import { Card } from "./card";

/**
 * Un valor del club en la sección de valores de The Way: su código en grande, su título si
 * lo tiene y su descripción. El código es un `<h2>`: el `<h1>` es el de la pantalla que lo contiene.
 * Sin título no se pinta un párrafo vacío.
 */
export function ValueBlock({ value }: { value: ClubValue }) {
  return (
    <article>
      <Card>
        <h2 className="font-display text-display-m wrap-break-word uppercase">{value.code}</h2>
        {value.title ? <p className="text-body-strong">{value.title}</p> : null}
        <p className="text-body-l text-ink-2">{value.description}</p>
      </Card>
    </article>
  );
}
