import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getRelatedDrills } from "@/modules/drills/queries";
import { formatStandardNumber } from "@/modules/methodology/format";
import { getWaySection } from "@/modules/methodology/queries";
import { wayLabel } from "@/modules/tenancy/navigation";
import { BackLink } from "@/ui/back-link";
import { MarkdownBody } from "@/ui/markdown-body";
import { PrincipleCard } from "@/ui/principle-card";
import { ScrollToHash } from "@/ui/scroll-to-hash";
import { StandardBlock } from "@/ui/standard-block";
import { EmptyState } from "@/ui/states";
import { ValueBlock } from "@/ui/value-block";

/** Lo que cuenta cada lista, para el aviso de que aún no hay nada publicado en ella. */
const LIST_NAMES = {
  values: "valores",
  principles: "principios",
  standards: "Standards",
} as const;

/**
 * Una sección de The Way: su número, su título, su resumen y su texto en Markdown y, según su
 * tipo, los valores, los principios o los Standards publicados del club.
 *
 * Una sección que no existe y una que está en borrador dan el mismo 404: `getWaySection`
 * devuelve `null` en los dos casos y aquí no se distinguen. El título es el `<h1>`; los
 * bloques de debajo, `<h2>`.
 *
 * El texto de una sección estructurada es su introducción y va antes de la lista. Una lista
 * sin nada publicado, o una sección de texto sin cuerpo, dice que está vacía y ofrece volver
 * a The Way (con el nombre que el club le da).
 *
 * En una sección de principios, cada principio enseña además los ejercicios de la biblioteca
 * que lo trabajan (hasta tres) y enlaza a la biblioteca filtrada por él: es el paso de «lo que
 * jugamos» a «cómo se entrena». The Way lo leen todos los miembros, pero la biblioteca es del
 * cuerpo técnico: a un jugador o una familia no se les ofrece (`drill.view`) y no se lee
 * nada. Se leen de una vez para todos los principios de la sección, y si la lectura falla la
 * página falla con ella (lo recoge `error.tsx`), como en cualquier otra lectura.
 */
export default async function WaySectionPage({ params }: PageProps<"/c/[club]/way/[section]">) {
  const { club, section: slug } = await params;
  const ctx = await requireClub(club);

  const view = await getWaySection(ctx, slug);
  if (!view) notFound();

  const { section } = view;
  const backTo = { label: wayLabel(ctx.branding.terminology), href: `/c/${ctx.org.slug}/way` };
  const hasBody = section.bodyMd.trim() !== "";

  // Solo las secciones de principios, y solo si hay principios y la biblioteca es de quien mira.
  const related =
    section.contentKind === "principles" && view.principles.length > 0 && can(ctx, "drill.view")
      ? await getRelatedDrills(
          ctx,
          view.principles.map((principle) => principle.id),
        )
      : null;

  let content = null;
  if (section.contentKind === "text") {
    if (!hasBody) {
      content = (
        <EmptyState
          title="Esta sección todavía no tiene contenido"
          body="Vuelve a consultarla más adelante."
          action={backTo}
        />
      );
    }
  } else {
    const blocks =
      section.contentKind === "values"
        ? view.values.map((value) => <ValueBlock key={value.id} value={value} />)
        : section.contentKind === "principles"
          ? view.principles.map((principle) => (
              <PrincipleCard
                key={principle.id}
                principle={principle}
                related={
                  related
                    ? {
                        drills: related[principle.id] ?? [],
                        href: `/c/${ctx.org.slug}/drills?principle=${encodeURIComponent(principle.slug)}`,
                      }
                    : undefined
                }
              />
            ))
          : view.standards.map((standard) => (
              <StandardBlock key={standard.id} standard={standard} />
            ));

    content =
      blocks.length > 0 ? (
        <div className="flex flex-col gap-(--space-3)">{blocks}</div>
      ) : (
        <EmptyState
          title={`Todavía no hay ${LIST_NAMES[section.contentKind]} publicados`}
          body="Cuando dirección los publique, aparecerán aquí."
          action={backTo}
        />
      );
  }

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-2)">
      <BackLink href={backTo.href} label={backTo.label} />

      <header className="flex flex-col gap-(--space-2)">
        <p className="font-display text-numeral text-brand-accent tabular-nums">
          {formatStandardNumber(section.number)}
        </p>
        <h1 className="font-display text-display-l wrap-break-word uppercase">{section.title}</h1>
        {section.summary ? <p className="text-body-l text-ink-2">{section.summary}</p> : null}
      </header>

      {hasBody ? <MarkdownBody markdown={section.bodyMd} /> : null}
      {content}

      {/* Dentro del contenido, no en un layout: así se monta cuando los destinos de los anclas
          (`#principle-{slug}`, `#standard-NN`) ya existen, también si la sección llega tras el
          `loading.tsx`. */}
      <ScrollToHash />
    </div>
  );
}
