import { formatStandardNumber } from "@/modules/methodology/format";
import type { WayIndexEntry } from "@/modules/methodology/types";
import { Card } from "./card";
import { Hero } from "./hero";
import { WayIcon } from "./icons";
import { ListRow } from "./list-row";
import { EmptyState } from "./states";

/**
 * El índice de The Way: el nombre y el lema del club en el `Hero` y una fila por sección
 * publicada, con su número, su título y la línea que lleva debajo.
 *
 * Solo pinta: las secciones llegan ya filtradas (solo las publicadas) y en su orden de
 * `getWayIndex`, y el nombre y el lema salen del branding del club. Nada de un club está
 * escrito aquí. El número de cada fila es el de Gestión (`formatStandardNumber`: «03»), así que
 * un borrador intermedio deja un hueco, a propósito.
 *
 * Un club que aún no ha publicado nada ve el `Hero` y un aviso, no un error. La salida del
 * aviso la decide quien monta la pantalla (`emptyAction`): quien administra puede ir a
 * Gestión; el resto, volver a Inicio. El `<h1>` es el del `Hero`.
 */
export function WayIndexView({
  wayName,
  tagline,
  sections,
  clubSlug,
  emptyAction,
}: {
  wayName: string;
  tagline: string | null;
  sections: WayIndexEntry[];
  clubSlug: string;
  emptyAction: { label: string; href: string };
}) {
  return (
    <>
      <Hero kicker={tagline} title={wayName} />

      <div className="px-(--space-4)">
        {sections.length > 0 ? (
          <Card variant="flush">
            {/* Las filas van directas dentro de la card: así pinta sus separadores. */}
            {sections.map((section) => (
              <ListRow
                key={section.id}
                href={`/c/${clubSlug}/way/${section.slug}`}
                lead={
                  <span className="font-display text-numeral tabular-nums">
                    {formatStandardNumber(section.number)}
                  </span>
                }
                title={section.title}
                subtitle={section.subtitle ?? undefined}
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={<WayIcon size={28} />}
            title="Tu club todavía no ha publicado su metodología"
            body="Cuando dirección la publique, la verás aquí."
            action={emptyAction}
          />
        )}
      </div>
    </>
  );
}
