import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { formatStandardNumber } from "@/modules/methodology/format";
import { getWaySection } from "@/modules/methodology/queries";
import { wayLabel } from "@/modules/tenancy/navigation";
import { BackLink } from "@/ui/back-link";
import { MarkdownBody } from "@/ui/markdown-body";
import { PrincipleCard } from "@/ui/principle-card";
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
 */
export default async function WaySectionPage({ params }: PageProps<"/c/[club]/way/[section]">) {
  const { club, section: slug } = await params;
  const ctx = await requireClub(club);

  const view = await getWaySection(ctx, slug);
  if (!view) notFound();

  const { section } = view;
  const backTo = { label: wayLabel(ctx.branding.terminology), href: `/c/${ctx.org.slug}/way` };
  const hasBody = section.bodyMd.trim() !== "";

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
              <PrincipleCard key={principle.id} principle={principle} />
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
    </div>
  );
}
