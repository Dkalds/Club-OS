import { requireAdmin, requireClub } from "@/lib/guards";
import { listSectionsForAdmin } from "@/modules/methodology/admin-queries";
import { formatStandardNumber } from "@/modules/methodology/format";
import { CONTENT_KIND_LABELS } from "@/modules/methodology/types";
import { wayLabel } from "@/modules/tenancy/navigation";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { WayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { CreateSectionForm } from "../_components/create-section-form";
import { ItemControls } from "../_components/item-controls";
import { StatusPill } from "../_components/status-pill";

/**
 * Las secciones de la metodología del club, todas, publicadas o no, en su orden: desde aquí se
 * ordenan, se publican y se abren para editar, y debajo se crea una nueva.
 *
 * El número de cada fila es la posición de la sección (`formatStandardNumber`: «03») y es el que
 * ve el entrenador: un borrador entre dos publicadas le deja un hueco, a propósito. Subir o
 * bajar una fila cambia los números de todas las demás: las acciones revalidan Gestión y la
 * lista se repinta con los nuevos.
 *
 * Una fila es una tarjeta apilada en móvil (arriba qué es, debajo qué se le puede hacer) y una
 * sola línea desde `lg`.
 */
export default async function AdminWayPage({ params }: PageProps<"/c/[club]/admin/way">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  const sections = await listSectionsForAdmin(ctx);
  const slug = ctx.org.slug;

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">{wayLabel(ctx.branding.terminology)}</h1>
        <p className="text-ink-2">
          Ordena las secciones y publica las que estén listas. Los entrenadores solo ven lo
          publicado.
        </p>
      </header>

      {sections.length > 0 ? (
        <Card variant="flush">
          <ul className="divide-y divide-line">
            {sections.map((section, index) => (
              <li
                key={section.id}
                className="flex flex-col gap-(--space-3) px-(--space-4) py-(--space-4) lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex min-w-0 items-start gap-(--space-3)">
                  <span className="w-(--space-8) shrink-0 font-display text-numeral text-brand-accent tabular-nums">
                    {formatStandardNumber(section.number)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-(--space-1)">
                    <p className="text-body-strong wrap-break-word">{section.title}</p>
                    <p className="text-body-s text-ink-3">{CONTENT_KIND_LABELS[section.contentKind]}</p>
                  </div>
                  <StatusPill status={section.status} />
                </div>
                <div className="flex flex-wrap items-center gap-(--space-2)">
                  <ItemControls
                    clubSlug={slug}
                    kind="way_sections"
                    id={section.id}
                    title={section.title}
                    status={section.status}
                    isFirst={index === 0}
                    isLast={index === sections.length - 1}
                  />
                  <CTAButton
                    variant="secondary"
                    href={`/c/${slug}/admin/way/${section.id}`}
                    aria-label={`Editar ${section.title}`}
                  >
                    Editar
                  </CTAButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<WayIcon size={28} />}
          title="Aún no hay secciones"
          body="Crea la primera sección de la metodología de tu club."
        />
      )}

      <CreateSectionForm clubSlug={slug} />
    </>
  );
}
