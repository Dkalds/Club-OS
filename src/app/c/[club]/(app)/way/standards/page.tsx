import { requireClub } from "@/lib/guards";
import { getStandards } from "@/modules/methodology/queries";
import { standardsLabel, wayLabel } from "@/modules/tenancy/navigation";
import { BackLink } from "@/ui/back-link";
import { StandardBlock } from "@/ui/standard-block";
import { EmptyState } from "@/ui/states";

/**
 * Los Standards del club, todos juntos: la página a la que enlaza el chip `StandardBadge` de
 * un ejercicio o una sesión (`#standard-NN`). El título es el nombre que el club da a sus
 * Standards, y es el `<h1>`.
 *
 * Solo lo publicado (`getStandards` filtra por club y estado aunque RLS deje ver más). Sin
 * ninguno publicado dice que está vacío y ofrece volver a The Way (con el nombre que el club
 * le da).
 */
export default async function WayStandardsPage({ params }: PageProps<"/c/[club]/way/standards">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const { org, branding } = ctx;

  const standards = await getStandards(ctx);
  const backTo = { label: wayLabel(branding.terminology), href: `/c/${org.slug}/way` };

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-2)">
      <BackLink href={backTo.href} label={backTo.label} />

      <h1 className="font-display text-display-l wrap-break-word uppercase">
        {standardsLabel(branding.terminology)}
      </h1>

      {standards.length > 0 ? (
        <div className="flex flex-col gap-(--space-3)">
          {standards.map((standard) => (
            <StandardBlock key={standard.id} standard={standard} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Todavía no hay Standards publicados"
          body="Cuando dirección los publique, aparecerán aquí."
          action={backTo}
        />
      )}
    </div>
  );
}
