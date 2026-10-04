import { RELATED_PER_PRINCIPLE } from "@/modules/drills/map-rows";
import type { DrillSummary } from "@/modules/drills/types";
import type { GamePrinciple } from "@/modules/methodology/types";
import { Card } from "./card";
import { CTAButton } from "./cta-button";
import { DrillCard } from "./drill-card";

/**
 * Los ejercicios de la biblioteca que trabajan el principio: `drills` son los publicados (la
 * tarjeta enseña los tres primeros) y `href` es la biblioteca filtrada por este principio.
 */
export type RelatedDrills = { drills: DrillSummary[]; href: string };

/**
 * Un principio de juego del club con sus puntos, en la sección de principios de The Way.
 *
 * El `id` es `principle-{slug}`: es el destino de los enlaces que llegan desde un ejercicio o
 * un objetivo, y `anchor-below-header` hace que al saltar a él la cabecera fija no lo tape. El
 * título es un `<h2>`: el `<h1>` es el de la pantalla que lo contiene. Lo que el principio no
 * tiene (resumen, puntos) no se pinta: ni un párrafo ni una lista vacíos.
 *
 * Con `related` cierra la cadena «principio → ejercicio»: debajo de los puntos, el bloque
 * «Ejercicios relacionados» (un `<h3>`). Sin `related` la tarjeta es la de siempre: quien no
 * puede usar la biblioteca (un jugador, una familia) no ve nada de esto, y Gestión tampoco.
 * Sigue siendo un componente de servidor, como `DrillCard`.
 */
export function PrincipleCard({
  principle,
  related,
}: {
  principle: GamePrinciple;
  related?: RelatedDrills;
}) {
  return (
    <article id={`principle-${principle.slug}`} className="anchor-below-header">
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
        {related ? <RelatedDrillsBlock related={related} /> : null}
      </Card>
    </article>
  );
}

/**
 * El bloque «Ejercicios relacionados» de un principio.
 *
 * Las filas son las de la biblioteca (`DrillCard`, hijos directos de la lista para que pinten
 * sus separadores), pero dentro de una tarjeta que ya tiene su relleno: la lista lo tapa con un
 * margen negativo igual (`space-4`), así el texto de cada fila queda alineado con el del
 * principio y los separadores llegan de borde a borde, sin una caja dentro de otra ni un doble
 * relleno. Va en medio de la tarjeta, con el enlace de abajo, así que ninguna fila toca las
 * esquinas redondeadas.
 *
 * Las fichas cuelgan de la ruta de la biblioteca, que es la de `href` sin su consulta. Sin
 * ejercicios lo dice, y no enlaza a la biblioteca: «Ver todos» llevaría a una lista vacía.
 */
function RelatedDrillsBlock({ related }: { related: RelatedDrills }) {
  const drills = related.drills.slice(0, RELATED_PER_PRINCIPLE);
  const [libraryPath] = related.href.split(/[?#]/);

  return (
    <div className="flex flex-col gap-(--space-3)">
      <h3 className="text-label text-ink-2 uppercase">Ejercicios relacionados</h3>
      {drills.length > 0 ? (
        <>
          <div className="-mx-(--space-4) border-y border-line">
            {drills.map((drill) => (
              <DrillCard key={drill.id} drill={drill} href={`${libraryPath}/${drill.id}`} />
            ))}
          </div>
          {/* El relleno del botón (`space-2`) se compensa con un margen negativo igual, como en
              `BackLink`: su texto queda alineado con el de la tarjeta. */}
          <CTAButton variant="ghost" href={related.href} className="-ml-(--space-2) self-start">
            Ver todos en la biblioteca
          </CTAButton>
        </>
      ) : (
        <p className="text-body-s text-ink-2">Aún no hay ejercicios con este principio.</p>
      )}
    </div>
  );
}
