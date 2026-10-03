import type { GamePrinciple } from "@/modules/methodology/types";
import { Card } from "./card";

/**
 * Un principio de juego del club con sus puntos, en la sección de principios de The Way.
 *
 * El `id` es `principle-{slug}`: es el destino de los enlaces que llegan desde un ejercicio o
 * un objetivo. El título es un `<h2>`: el `<h1>` de la pantalla es su `Hero`. Lo que el principio
 * no tiene (resumen, puntos) no se pinta: ni un párrafo ni una lista vacíos.
 */
export function PrincipleCard({ principle }: { principle: GamePrinciple }) {
  return (
    <article id={`principle-${principle.slug}`}>
      <Card>
        <h2 className="font-display text-title wrap-break-word uppercase">{principle.title}</h2>
        {principle.summary ? <p className="text-body-l text-ink-2">{principle.summary}</p> : null}
        {principle.points.length > 0 ? (
          <ul className="flex list-disc flex-col gap-(--space-2) pl-(--space-6) text-body-l text-ink-2 marker:text-ink-3">
            {principle.points.map((point) => (
              <li key={point.id}>{point.text}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    </article>
  );
}
