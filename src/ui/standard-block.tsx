import { formatStandardNumber } from "@/modules/methodology/format";
import type { Standard } from "@/modules/methodology/types";
import { Card } from "./card";

/**
 * Un Standard explicado, en la lista de Standards de The Way (design/components/StandardBadge,
 * el bloque): su número grande en el acento, el kicker «Standard», el título y la descripción.
 *
 * El `id` es `standard-NN` (con dos cifras): es el destino del chip `StandardBadge` que enlaza
 * desde un ejercicio o una sesión, y `anchor-below-header` hace que al saltar a él la cabecera
 * fija no lo tape. El título es un `<h2>`: el `<h1>` es el de la pantalla que lo contiene.
 */
export function StandardBlock({ standard }: { standard: Standard }) {
  const number = formatStandardNumber(standard.number);

  return (
    <article id={`standard-${number}`} className="anchor-below-header">
      <Card>
        <div className="flex gap-(--space-3)">
          {/* 40px y su interlineado: `.cos-std-block__num` de design/components/bundle.css; no
              hay estilo de texto con esa medida. */}
          <span className="font-display text-[40px] leading-10 font-bold text-brand-accent tabular-nums">
            {number}
          </span>
          <div className="flex min-w-0 flex-col gap-(--space-1)">
            <p className="text-label text-ink-2 uppercase">Standard</p>
            <h2 className="font-display text-title wrap-break-word uppercase">{standard.title}</h2>
            <p className="text-body-s text-ink-3">{standard.description}</p>
          </div>
        </div>
      </Card>
    </article>
  );
}
